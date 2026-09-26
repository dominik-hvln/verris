import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { isIP } from 'net';
import { Injectable, StreamableFile, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { map } from 'rxjs';

/**
 * PB-36 — podpisywanie wszystkiego, co control-plane wysyła węzłom do wykonania.
 *
 * Klucz prywatny Ed25519 jest tylko w API (VERRIS_SCRIPT_SIGNING_KEY, PKCS#8 PEM albo jego base64).
 * Klucz publiczny trafia na węzeł przy bootstrapie / instalacji agenta (/etc/verris/script-signing.pub).
 * Każda odpowiedź GET z /agent/tasks/* dostaje nagłówki X-Verris-Signature + X-Verris-Signed-At;
 * węzeł (verris-fetch) sprawdza podpis `openssl pkeyutl -verify -rawin` ZANIM zapisze plik.
 * Podpis obejmuje ścieżkę, id węzła, czas i SHA-256 treści — skryptu nie da się podmienić, podać
 * pod inną ścieżką, innemu węzłowi ani odtworzyć po 5 minutach.
 * Zaufanie startowe: sam skrypt bootstrapu (TLS + jednorazowy token) — on przywozi klucz publiczny.
 */

let klucz: KeyObject | null = null;

function kluczPrywatny(): KeyObject {
  if (klucz) return klucz;
  const raw = (process.env.VERRIS_SCRIPT_SIGNING_KEY ?? '').trim();
  if (raw) {
    const pem = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
    const k = createPrivateKey(pem);
    if (k.asymmetricKeyType !== 'ed25519') throw new Error('VERRIS_SCRIPT_SIGNING_KEY musi być kluczem Ed25519 (PKCS#8 PEM).');
    return (klucz = k);
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Missing required environment variable: VERRIS_SCRIPT_SIGNING_KEY');
  // dev/test: klucz na czas życia procesu (węzły lokalnie nie istnieją)
  return (klucz = generateKeyPairSync('ed25519').privateKey);
}

export function kluczPublicznyPem(): string {
  return createPublicKey(kluczPrywatny()).export({ type: 'spki', format: 'pem' }).toString();
}

export function wiadomoscPodpisu(sciezka: string, serverId: string, ts: number, tresc: Buffer | string): string {
  const sha = createHash('sha256').update(tresc).digest('hex');
  return `verris-sig-v1\n${sciezka}\n${serverId}\n${ts}\n${sha}`;
}

export function podpisz(sciezka: string, serverId: string, tresc: Buffer | string, ts = Math.floor(Date.now() / 1000)) {
  const podpis = sign(null, Buffer.from(wiadomoscPodpisu(sciezka, serverId, ts, tresc)), kluczPrywatny()).toString('base64');
  return { ts, podpis };
}

/** VERRIS_CONTROL_PLANE_IPS — adresy/sieci control-plane (przecinek), jedyne źródła SSH klucza deploy. */
export function adresyControlPlane(): string {
  const lista = (process.env.VERRIS_CONTROL_PLANE_IPS ?? '').split(/[\s,]+/).filter(Boolean);
  for (const a of lista) {
    const [ip, maska, ...reszta] = a.split('/');
    const wersja = isIP(ip);
    const max = wersja === 6 ? 128 : 32;
    if (!wersja || reszta.length || (maska !== undefined && !(/^\d{1,3}$/.test(maska) && Number(maska) <= max))) {
      throw new Error(`VERRIS_CONTROL_PLANE_IPS: nieprawidłowy adres „${a}”.`);
    }
  }
  return lista.join(',');
}

/**
 * Wpis authorized_keys dla klucza deploy control-plane: tylko z adresów control-plane, bez
 * przekierowań. `null` = brak klucza albo brak adresów (klucz bez ograniczenia nie trafia na węzeł).
 */
export function linijkaAuthorizedKeys(pubkey: string | null | undefined): string | null {
  const m = /^(ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-rsa) ([A-Za-z0-9+/]+={0,2})(?:\s|$)/.exec((pubkey ?? '').trim());
  const from = adresyControlPlane();
  if (!m || !from) return null;
  return `from="${from}",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc ${m[1]} ${m[2]} verris-control-plane`;
}

/** Start API w produkcji: bez klucza podpisu albo z kluczem deploy bez adresów control-plane — odmowa. */
export function sprawdzKonfiguracjeWezlow(isProd: boolean): void {
  if (!isProd) return;
  kluczPrywatny();
  const deploy = (process.env.VERRIS_NODE_DEPLOY_SSH_PUBKEY ?? '').trim();
  if (deploy && !linijkaAuthorizedKeys(deploy)) {
    throw new Error('VERRIS_NODE_DEPLOY_SSH_PUBKEY wymaga VERRIS_CONTROL_PLANE_IPS (i poprawnego klucza SSH) — klucz deploy tylko z adresów control-plane.');
  }
}

/** Podpisuje każdą odpowiedź GET kontrolera agenta (tekst, pakiet, JSON). */
@Injectable()
export class PodpisOdpowiedziInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Request & { serverId?: string }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    if (req.method !== 'GET') return next.handle();
    const sciezka = req.path.slice(Math.max(0, req.path.indexOf('/agent/')));
    return next.handle().pipe(
      map((wynik: unknown) => {
        let tresc: Buffer | string;
        if (Buffer.isBuffer(wynik) || typeof wynik === 'string') {
          tresc = wynik;
        } else {
          tresc = JSON.stringify(wynik ?? null);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        const { ts, podpis } = podpisz(sciezka, req.serverId ?? '', tresc);
        res.setHeader('X-Verris-Signature', podpis);
        res.setHeader('X-Verris-Signed-At', String(ts));
        // Buffer zwrócony wprost Nest serializuje do JSON — pakiet idzie jako strumień bajt w bajt
        return Buffer.isBuffer(tresc) ? new StreamableFile(tresc) : tresc;
      }),
    );
  }
}

const KLUCZ_NA_WEZLE = '/etc/verris/script-signing.pub';

/**
 * /usr/local/bin/verris-fetch — jedyna droga, którą węzeł pobiera z control-plane coś do wykonania.
 * Kody wyjścia: 0 OK, 1 pobranie/HTTP, 2 brak klucza publicznego, 3 podpis nieprawidłowy, 4 HTTP 404.
 */
export function renderVerrisFetchScript(): string {
  return `#!/usr/bin/env bash
# Verris — pobranie pliku z control-plane z weryfikacją podpisu Ed25519 (PB-36).
# Użycie: verris-fetch <ścieżka /agent/...> <plik docelowy | -> [limit czasu s]
# Kody: 0 OK, 1 pobranie/HTTP, 2 brak klucza publicznego, 3 podpis nieprawidłowy, 4 HTTP 404.
set -uo pipefail
P="\${1:?ścieżka}"
DEST="\${2:?plik docelowy albo -}"
TMO="\${3:-60}"
PUB="\${VERRIS_SIG_PUB:-${KLUCZ_NA_WEZLE}}"
# shellcheck disable=SC1090
. "\${VERRIS_CONF:-/etc/verris.conf}"
err() { echo "[verris-fetch] $P: $*" >&2; }
[ -r "$PUB" ] || { err "brak klucza podpisu $PUB — uruchom ponownie instalację agenta z panelu"; exit 2; }
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
code=$(curl -sS --max-time "$TMO" -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \\
  -D "$T/h" -o "$T/b" -w '%{http_code}' "$VERRIS_API_URL$P") || { err "błąd połączenia"; exit 1; }
[ "$code" = "404" ] && exit 4
[ "$code" = "200" ] || { err "HTTP $code"; exit 1; }
hdr() { tr -d '\\r' < "$T/h" | awk -v n="$1" '{ i = index($0, ":"); if (i && tolower(substr($0, 1, i - 1)) == n) v = substr($0, i + 2) } END { print v }'; }
sig=$(hdr x-verris-signature)
ts=$(hdr x-verris-signed-at)
case "$ts" in ''|*[!0-9]*) err "brak podpisu control-plane — plik odrzucony"; exit 3 ;; esac
d=$(( $(date +%s) - ts ))
[ "\${d#-}" -le 300 ] || { err "podpis sprzed \${d}s (zegar węzła albo powtórzona odpowiedź) — plik odrzucony"; exit 3; }
printf 'verris-sig-v1\\n%s\\n%s\\n%s\\n%s' "$P" "$VERRIS_SERVER_ID" "$ts" "$(sha256sum "$T/b" | cut -d' ' -f1)" > "$T/m"
if ! printf '%s' "$sig" | base64 -d > "$T/s" 2>/dev/null || [ ! -s "$T/s" ] \\
  || ! openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$T/m" -sigfile "$T/s" >/dev/null 2>&1; then
  err "PODPIS NIEPRAWIDŁOWY — plik odrzucony"
  exit 3
fi
if [ "$DEST" = "-" ]; then
  cat "$T/b"
else
  install -m 0600 "$T/b" "$DEST.verris-new" && mv -f "$DEST.verris-new" "$DEST"
fi
`;
}

/** Bash: klucz publiczny + verris-fetch na węźle (bootstrap i instalacja agenta z panelu). */
export function renderInstalacjaPodpisu(): string {
  return `mkdir -p /etc/verris && chmod 755 /etc/verris
cat > ${KLUCZ_NA_WEZLE} <<'__VERRIS_SIG_PUB__'
${kluczPublicznyPem().trim()}
__VERRIS_SIG_PUB__
chmod 644 ${KLUCZ_NA_WEZLE}
cat > /usr/local/bin/verris-fetch <<'__VERRIS_FETCH__'
${renderVerrisFetchScript()}__VERRIS_FETCH__
chmod 755 /usr/local/bin/verris-fetch
echo "[verris] Zainstalowano klucz podpisu control-plane i verris-fetch (PB-36)"`;
}

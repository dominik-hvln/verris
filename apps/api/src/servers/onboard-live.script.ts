import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import * as archiver from 'archiver';

/**
 * PB-31 — Onboard LIVE jako zadanie agenta (bez scp i ręcznego SSH).
 *
 * Agent pobiera pakiet onboardu w układzie repo i rozpakowuje go do /opt/verris — stałego
 * miejsca, bo security-watch (systemd) wskazuje skrypty w tym katalogu. Potem uruchamia
 * ops/scripts/node-onboard-live.sh; klucz admina DA bierze z oficjalnego `da api-url`,
 * a wynik gotowości sam trafia do control-plane (POST /agent/tasks/onboard-report).
 */
export const KATALOG_NA_WEZLE = '/opt/verris';

/** Skrypty węzła do pakietu — bez skryptów control-plane (prod-*, vpn-*, restore-drill…). */
const DO_PAKIETU = /^(node-.*|verris-.*|security-.*|install-verris-default-page)\.sh$/;

function korzenOps(): string {
  const kandydaci = [
    join(process.cwd(), 'ops'),
    join(process.cwd(), '../../ops'),
    join(__dirname, '../../../../../ops'),
    join(__dirname, '../../../../ops'),
  ];
  const k = kandydaci.find((p) => existsSync(join(p, 'scripts/node-onboard-live.sh')));
  if (!k) throw new Error('ops/scripts/node-onboard-live.sh not found in monorepo');
  return k;
}

/** Lista plików pakietu (ścieżki względem korzenia repo) — też do testu. */
export function plikiPakietuOnboardu(): string[] {
  const ops = korzenOps();
  const skrypty = readdirSync(join(ops, 'scripts'))
    .filter((f) => DO_PAKIETU.test(f))
    .map((f) => `ops/scripts/${f}`);
  const lib = readdirSync(join(ops, 'scripts/lib')).map((f) => `ops/scripts/lib/${f}`);
  const systemd = readdirSync(join(ops, 'systemd'))
    .filter((f) => f.startsWith('verris-security-'))
    .map((f) => `ops/systemd/${f}`);
  const bezp = readdirSync(join(ops, 'etc/verris/security')).map((f) => `ops/etc/verris/security/${f}`);
  return [...skrypty, ...lib, ...systemd, ...bezp].sort();
}

export function buildOnboardBundle(): Promise<Buffer> {
  const ops = korzenOps();
  const korzen = join(ops, '..');
  return new Promise((resolve, reject) => {
    const archive = new archiver.TarArchive({ gzip: true });
    const chunks: Buffer[] = [];
    archive.on('data', (c: Buffer) => chunks.push(c));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const p of plikiPakietuOnboardu()) archive.file(join(korzen, p), { name: p, mode: p.endsWith('.sh') ? 0o755 : 0o644 });
    archive.directory(join(ops, 'hosting-default-page'), 'ops/hosting-default-page');
    void archive.finalize();
  });
}

export function loadOnboardLiveScript(): string {
  return `#!/usr/bin/env bash
# Verris — Onboard LIVE uruchamiany przez agenta zadań (PB-31).
set -Eeuo pipefail
# shellcheck disable=SC1091
. /etc/verris.conf
DIR='${KATALOG_NA_WEZLE}'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "[onboard-task] Pobieram pakiet onboardu z control-plane…"
curl -fsS --max-time 120 -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \\
  "$VERRIS_API_URL/agent/tasks/onboard-live/bundle" -o "$TMP/pakiet.tgz"
mkdir -p "$DIR"
tar xzf "$TMP/pakiet.tgz" -C "$DIR" --no-same-owner
chmod 0700 "$DIR"
echo "[onboard-task] Pakiet w $DIR — uruchamiam node-onboard-live.sh"
exec bash "$DIR/ops/scripts/node-onboard-live.sh"
`;
}

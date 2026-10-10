import { lookup as dnsLookupCb } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adresyWezlow, isControlPlaneIp, naLiscie } from './adresy-verris.js';

/**
 * Wysyłka webhooka z kontrolą adresu W CHWILI POŁĄCZENIA (nie tylko przed nią). Samo
 * assertPublicWebhookUrl + fetch zostawia okno na DNS rebinding: nazwa przy sprawdzeniu wskazuje
 * adres publiczny, a przy połączeniu (TTL 0) — prywatny. Tu `lookup` gniazda odrzuca adres
 * prywatny/zarezerwowany, więc połączenie z siecią wewnętrzną nie powstaje. Bez przekierowań.
 */
export function postWebhookBezpiecznie(raw: string, headers: Record<string, string>, body: string, timeoutMs = 10_000): Promise<number> {
  const url = new URL(raw);
  if (url.protocol !== 'https:') return Promise.reject(new Error('Webhook URL must use HTTPS.'));
  const opcje = opcjeDlaPortu(url);
  return odrzucAdresWprost(url, opcje).then(() => new Promise<number>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
        timeout: timeoutMs,
        lookup: lookupBezpieczny(opcje) as never,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    req.end(body);
  }));
}

/**
 * GET z tą samą kontrolą adresu w chwili połączenia (monitoring strony klienta — klient sam
 * kontroluje DNS swojej domeny, więc rebinding jest dla niego wykonalny). Bez przekierowań.
 */
export function getBezpiecznie(raw: string, headers: Record<string, string>, timeoutMs: number): Promise<number> {
  const url = new URL(raw);
  const req = url.protocol === 'https:' ? httpsRequest : url.protocol === 'http:' ? httpRequest : null;
  if (!req) return Promise.reject(new Error('Nieobsługiwany protokół.'));
  const opcje = opcjeDlaPortu(url);
  return odrzucAdresWprost(url, opcje).then(() => new Promise<number>((resolve, reject) => {
    const r = req(url, { method: 'GET', headers, timeout: timeoutMs, lookup: lookupBezpieczny(opcje) as never }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('timeout'), { name: 'AbortError' })));
    r.on('error', reject);
    r.end();
  }));
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | { address: string; family: number }[], family?: number) => void;
type LookupFn = (host: string, opts: { all?: boolean } & Record<string, unknown>, cb: LookupCb) => void;

/**
 * `wezly: 'dozwolone'` — połączenie z usługą klienta hostowaną na naszym węźle na porcie wybranym przez
 * nasz kod (strona :443, poczta :993/:587 — sondy stron, TLS domen, diagnostyka, zdrowie usługi).
 * Domyślnie węzły są zakazane jak w migratorze (resolvePublicHost).
 */
export interface OpcjeLookup {
  wezly?: 'zakazane' | 'dozwolone';
}

/**
 * Węzeł tylko na porcie WWW (80/443), czyli tam, gdzie są strony klientów (np. odbiornik webhooka
 * na stronie hostowanej u nas). Port wybrany przez klienta (np. :2222, :22, :3306) na adres węzła —
 * odmowa: zapora węzła wpuszcza control-plane na panel, SSH i MariaDB.
 */
export function opcjeDlaPortu(url: URL): OpcjeLookup {
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return { wezly: port === '443' || port === '80' ? 'dozwolone' : 'zakazane' };
}

function blad(komunikat: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(komunikat), { code });
}

/**
 * dns.lookup, który w chwili połączenia (DNS rebinding) nie oddaje adresu prywatnego/zarezerwowanego,
 * adresu control-plane (VERRIS_CONTROL_PLANE_IPS) ani — przy `wezly: 'zakazane'` — adresu węzła z bazy.
 * D12 (10.10): wcześniej sprawdzał tylko zakresy prywatne, więc domena przełączona po sprawdzeniu
 * (resolvePublicHost) na publiczny adres control-plane trafiała do niego z pominięciem zapory.
 * Obsługa trybu all:true.
 */
export function lookupBezpieczny(opcje: OpcjeLookup = {}): LookupFn {
  return (host, opts, cb) => {
    dnsLookupCb(host, { ...opts, all: true }, (err, adresy) => {
      if (err) return cb(err);
      const lista = adresy as unknown as { address: string; family: number }[];
      sprawdzAdresy(
        lista.map((a) => a.address),
        opcje,
      ).then((odmowa) => (odmowa ? cb(odmowa) : opts.all ? cb(null, lista) : cb(null, lista[0].address, lista[0].family)));
    });
  };
}

/**
 * Wspólna reguła adresów połączenia (lookup i adres IP wpisany wprost w URL): prywatne/zarezerwowane → EPRIVATE,
 * control-plane i — przy `wezly: 'zakazane'` — węzły → EVERRIS. Błąd (zły VERRIS_CONTROL_PLANE_IPS, brak
 * rejestru węzłów w produkcji) = odmowa, nie przepuszczenie. Zwraca błąd albo null; nigdy nie odrzuca.
 */
export async function sprawdzAdresy(adresy: string[], opcje: OpcjeLookup = {}): Promise<NodeJS.ErrnoException | null> {
  if (!adresy.length || adresy.some((a) => isPrivateOrReservedIp(a))) {
    return blad('Webhook URL resolves to a private or reserved address.', 'EPRIVATE');
  }
  const serwerVerris = blad('Adres wskazuje na serwer Verris — odrzucono.', 'EVERRIS');
  try {
    if (adresy.some((a) => isControlPlaneIp(a))) return serwerVerris;
    if (opcje.wezly === 'dozwolone') return null;
    const wezly = await adresyWezlow();
    return adresy.some((a) => naLiscie(a, wezly)) ? serwerVerris : null;
  } catch (e) {
    return e as NodeJS.ErrnoException;
  }
}

/**
 * Przegląd D12 (10.10): Node NIE woła `lookup` gniazda, gdy host w URL jest adresem IP — `https://<adres CP>/`
 * albo `https://<adres węzła>:2222/` omijały lookupBezpieczny (assertPublicWebhookUrl sprawdza tylko zakresy
 * prywatne). Adres wpisany wprost sprawdzamy więc tą samą regułą przed połączeniem.
 */
async function odrzucAdresWprost(url: URL, opcje: OpcjeLookup): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!isIP(host)) return;
  const odmowa = await sprawdzAdresy([host], opcje);
  if (odmowa) throw odmowa;
}

/** Domyślny strażnik połączenia: prywatne, control-plane i węzły zakazane. */
export const bezpiecznyLookup: LookupFn = lookupBezpieczny();

/** Usługa klienta na naszym węźle na porcie wybranym przez nasz kod (sondy :443/:993/:587). */
export const lookupUslugiKlienta: LookupFn = lookupBezpieczny({ wezly: 'dozwolone' });

/**
 * Adresy, do których serwer nie łączy się w imieniu klienta (SSRF): sieci prywatne, pętla, link-local,
 * CGNAT, benchmark, dokumentacja, multicast/zarezerwowane, oraz prefiksy IPv6 zanurzające IPv4
 * (NAT64 64:ff9b::/96, 6to4 2002::/16, Teredo 2001::/32) — przez nie da się dojść do 127.0.0.1
 * czy 169.254.169.254 adresem wyglądającym na publiczny. `net.BlockList` zamiast porównań prefiksów
 * tekstowych (np. „fe80:” nie obejmowało fe81::–febf::). Jedna lista dla webhooków, sond i migratora.
 *
 * 09.10 — lista żyje w ops/scripts/lib/zastrzezone-zakresy.txt: ten sam plik jest źródłem tablicy
 * VG_ZASTRZEZONE w guardzie węzła (migration-input-guard.sh), więc obie strony odrzucają te same
 * zakresy (wcześniej guard przepuszczał m.in. NAT64 i 6to4). Brak pliku = API nie startuje.
 */
export function wczytajZastrzezoneZakresy(tresc = plikZakresow()): Array<{ adres: string; prefiks: number; rodzina: 'ipv4' | 'ipv6' }> {
  const zakresy = [];
  for (const linia of tresc.split('\n')) {
    const wpis = linia.replace(/#.*/, '').trim();
    if (!wpis) continue;
    const [adres, prefiks, ...reszta] = wpis.split('/');
    const rodzina = isIP(adres);
    if (!rodzina || reszta.length || !/^\d{1,3}$/.test(prefiks ?? '') || Number(prefiks) > (rodzina === 4 ? 32 : 128)) {
      throw new Error(`zastrzezone-zakresy.txt: nieprawidłowy wpis „${wpis}”.`);
    }
    zakresy.push({ adres, prefiks: Number(prefiks), rodzina: rodzina === 4 ? ('ipv4' as const) : ('ipv6' as const) });
  }
  if (!zakresy.length) throw new Error('zastrzezone-zakresy.txt: pusta lista zakresów.');
  return zakresy;
}

function plikZakresow(): string {
  const wzgledna = 'ops/scripts/lib/zastrzezone-zakresy.txt';
  const kandydaci = [
    join(process.cwd(), wzgledna),
    join(process.cwd(), '../..', wzgledna),
    join(import.meta.dirname, '../../../../..', wzgledna),
    join(import.meta.dirname, '../../../..', wzgledna),
  ];
  for (const p of kandydaci) if (existsSync(p)) return readFileSync(p, 'utf8');
  throw new Error(`Brak ${wzgledna} — lista adresów zastrzeżonych (SSRF) jest wymagana.`);
}

// Bez ::ffff:0:0/96 — BlockList sprawdza IPv4 także względem reguł IPv6 (jako ::ffff:a.b.c.d),
// więc ten prefiks zablokowałby cały IPv4. Zapis szesnastkowy ::ffff:7f00:1 obsługuje funkcja niżej.
const ZASTRZEZONE = new BlockList();
for (const { adres, prefiks, rodzina } of wczytajZastrzezoneZakresy()) ZASTRZEZONE.addSubnet(adres, prefiks, rodzina);

export function isPrivateOrReservedIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4 zapisany w IPv6 (::ffff:a.b.c.d) — sprawdzamy sam IPv4.
  if (lower.startsWith('::ffff:')) {
    const reszta = lower.slice(7);
    if (isIP(reszta) === 4) return isPrivateOrReservedIp(reszta);
    return true; // ::ffff:7f00:1 — IPv4 w zapisie szesnastkowym; DNS tak nie odpowiada, odmawiamy.
  }
  const rodzina = isIP(lower);
  if (rodzina === 0) return true;
  return ZASTRZEZONE.check(lower, rodzina === 4 ? 'ipv4' : 'ipv6');
}

import { lookup as dnsLookupCb } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

/**
 * Wysyłka webhooka z kontrolą adresu W CHWILI POŁĄCZENIA (nie tylko przed nią). Samo
 * assertPublicWebhookUrl + fetch zostawia okno na DNS rebinding: nazwa przy sprawdzeniu wskazuje
 * adres publiczny, a przy połączeniu (TTL 0) — prywatny. Tu `lookup` gniazda odrzuca adres
 * prywatny/zarezerwowany, więc połączenie z siecią wewnętrzną nie powstaje. Bez przekierowań.
 */
export function postWebhookBezpiecznie(raw: string, headers: Record<string, string>, body: string, timeoutMs = 10_000): Promise<number> {
  const url = new URL(raw);
  if (url.protocol !== 'https:') return Promise.reject(new Error('Webhook URL must use HTTPS.'));
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
        timeout: timeoutMs,
        lookup: bezpiecznyLookup as never,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * GET z tą samą kontrolą adresu w chwili połączenia (monitoring strony klienta — klient sam
 * kontroluje DNS swojej domeny, więc rebinding jest dla niego wykonalny). Bez przekierowań.
 */
export function getBezpiecznie(raw: string, headers: Record<string, string>, timeoutMs: number): Promise<number> {
  const url = new URL(raw);
  const req = url.protocol === 'https:' ? httpsRequest : url.protocol === 'http:' ? httpRequest : null;
  if (!req) return Promise.reject(new Error('Nieobsługiwany protokół.'));
  return new Promise((resolve, reject) => {
    const r = req(url, { method: 'GET', headers, timeout: timeoutMs, lookup: bezpiecznyLookup as never }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('timeout'), { name: 'AbortError' })));
    r.on('error', reject);
    r.end();
  });
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | { address: string; family: number }[], family?: number) => void;

/** dns.lookup, który nie oddaje adresu prywatnego/zarezerwowanego (obsługa trybu all:true). */
export function bezpiecznyLookup(host: string, opts: { all?: boolean } & Record<string, unknown>, cb: LookupCb): void {
  dnsLookupCb(host, { ...opts, all: true }, (err, adresy) => {
    if (err) return cb(err);
    const lista = adresy as unknown as { address: string; family: number }[];
    if (!lista.length || lista.some((a) => isPrivateOrReservedIp(a.address))) {
      return cb(Object.assign(new Error('Webhook URL resolves to a private or reserved address.'), { code: 'EPRIVATE' }));
    }
    if (opts.all) return cb(null, lista);
    cb(null, lista[0].address, lista[0].family);
  });
}

/**
 * Adresy, do których serwer nie łączy się w imieniu klienta (SSRF): sieci prywatne, pętla, link-local,
 * CGNAT, benchmark, dokumentacja, multicast/zarezerwowane, oraz prefiksy IPv6 zanurzające IPv4
 * (NAT64 64:ff9b::/96, 6to4 2002::/16, Teredo 2001::/32) — przez nie da się dojść do 127.0.0.1
 * czy 169.254.169.254 adresem wyglądającym na publiczny. `net.BlockList` zamiast porównań prefiksów
 * tekstowych (np. „fe80:” nie obejmowało fe81::–febf::). Jedna lista dla webhooków, sond i migratora.
 */
const ZASTRZEZONE = new BlockList();
for (const [adres, prefiks] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) ZASTRZEZONE.addSubnet(adres, prefiks, 'ipv4');
for (const [adres, prefiks] of [
  // Bez ::ffff:0:0/96 — BlockList sprawdza IPv4 także względem reguł IPv6 (jako ::ffff:a.b.c.d),
  // więc ten prefiks zablokowałby cały IPv4. Zapis szesnastkowy ::ffff:7f00:1 obsługuje funkcja niżej.
  ['::', 127], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) ZASTRZEZONE.addSubnet(adres, prefiks, 'ipv6');

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

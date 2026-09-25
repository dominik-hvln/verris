import { lookup as dnsLookupCb } from 'node:dns';
import { request as httpsRequest } from 'node:https';

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

export function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(ip.slice('::ffff:'.length));
  }
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:') ||
      lower.startsWith('ff')
    );
  }
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

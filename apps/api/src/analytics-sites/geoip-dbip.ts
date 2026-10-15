/**
 * Decyzja 15.10 (#16) — kraj odwiedzającego w statystykach stron z bazy DB-IP „IP to Country Lite”
 * (https://db-ip.com/db/download/ip-to-country-lite, licencja CC BY 4.0: wymagana wzmianka o źródle — ZRODLO_GEOIP,
 * pokazywana w panelu klienta przy sekcji „Kraje”). Format CSV: `ip_od,ip_do,kod_kraju` (ISO 3166-1 alfa-2),
 * zakresy IPv4 i IPv6 posortowane rosnąco. Adres IP nie jest nigdzie zapisywany — tylko wyszukiwany w pamięci.
 */
export const ZRODLO_GEOIP = 'IP Geolocation by DB-IP';
export const LINK_ZRODLA_GEOIP = 'https://db-ip.com';

export interface TablicaKrajow {
  kody: string[];
  v4Od: Uint32Array;
  v4Do: Uint32Array;
  v4Kraj: Uint16Array;
  /** IPv6 jako dwie połówki 64-bitowe (hi, lo). */
  v6OdHi: BigUint64Array;
  v6OdLo: BigUint64Array;
  v6DoHi: BigUint64Array;
  v6DoLo: BigUint64Array;
  v6Kraj: Uint16Array;
}

export function ipv4NaLiczbe(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return null;
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}

/** IPv6 → [hi, lo] (64 + 64 bity). Obsługuje „::” i końcówkę IPv4 (::ffff:1.2.3.4). */
export function ipv6NaLiczbe(ip: string): [bigint, bigint] | null {
  let s = ip.trim().toLowerCase();
  const strefa = s.indexOf('%');
  if (strefa >= 0) s = s.slice(0, strefa);
  if (!s.includes(':')) return null;
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (v4) {
    const n = ipv4NaLiczbe(v4[1]);
    if (n === null) return null;
    s = `${s.slice(0, -v4[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const czesci = s.split('::');
  if (czesci.length > 2) return null;
  const lewa = czesci[0] ? czesci[0].split(':') : [];
  const prawa = czesci.length === 2 && czesci[1] ? czesci[1].split(':') : [];
  const brak = 8 - lewa.length - prawa.length;
  if (czesci.length === 1 ? brak !== 0 : brak < 1) return null;
  const grupy = [...lewa, ...Array<string>(czesci.length === 2 ? brak : 0).fill('0'), ...prawa];
  if (grupy.length !== 8 || grupy.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const n = grupy.reduce((a, g) => (a << 16n) | BigInt(parseInt(g, 16)), 0n);
  return [n >> 64n, n & 0xffffffffffffffffn];
}

function porownaj(aHi: bigint, aLo: bigint, bHi: bigint, bLo: bigint): number {
  if (aHi !== bHi) return aHi < bHi ? -1 : 1;
  if (aLo !== bLo) return aLo < bLo ? -1 : 1;
  return 0;
}

/** Buduje tablicę z treści CSV. Wiersze nieczytelne pomija; „ZZ” (nieznany) traktuje jak brak kraju. */
export function zbudujTablice(csv: string): TablicaKrajow {
  const kody: string[] = [];
  const indeks = new Map<string, number>();
  const kod = (k: string) => {
    let i = indeks.get(k);
    if (i === undefined) {
      i = kody.length;
      kody.push(k);
      indeks.set(k, i);
    }
    return i;
  };
  const v4: Array<[number, number, number]> = [];
  const v6: Array<[bigint, bigint, bigint, bigint, number]> = [];
  for (const linia of csv.split('\n')) {
    const [od, doIp, kraj] = linia.trim().replace(/"/g, '').split(',');
    if (!od || !doIp || !/^[A-Z]{2}$/.test(kraj ?? '') || kraj === 'ZZ') continue;
    const a4 = ipv4NaLiczbe(od);
    if (a4 !== null) {
      const b4 = ipv4NaLiczbe(doIp);
      if (b4 !== null && b4 >= a4) v4.push([a4, b4, kod(kraj)]);
      continue;
    }
    const a6 = ipv6NaLiczbe(od);
    const b6 = ipv6NaLiczbe(doIp);
    if (a6 && b6 && porownaj(b6[0], b6[1], a6[0], a6[1]) >= 0) v6.push([a6[0], a6[1], b6[0], b6[1], kod(kraj)]);
  }
  v4.sort((x, y) => x[0] - y[0]);
  v6.sort((x, y) => porownaj(x[0], x[1], y[0], y[1]));
  return {
    kody,
    v4Od: Uint32Array.from(v4, (r) => r[0]),
    v4Do: Uint32Array.from(v4, (r) => r[1]),
    v4Kraj: Uint16Array.from(v4, (r) => r[2]),
    v6OdHi: BigUint64Array.from(v6, (r) => r[0]),
    v6OdLo: BigUint64Array.from(v6, (r) => r[1]),
    v6DoHi: BigUint64Array.from(v6, (r) => r[2]),
    v6DoLo: BigUint64Array.from(v6, (r) => r[3]),
    v6Kraj: Uint16Array.from(v6, (r) => r[4]),
  };
}

export function liczbaZakresow(t: TablicaKrajow): number {
  return t.v4Od.length + t.v6OdHi.length;
}

/** Kod kraju (ISO-2) dla adresu IPv4/IPv6 albo null. Adres IPv4 zapisany jako IPv6 (::ffff:a.b.c.d) — jak IPv4. */
export function krajDlaIp(t: TablicaKrajow, ip: string): string | null {
  const zmapowany = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip.trim());
  const n4 = ipv4NaLiczbe(zmapowany ? zmapowany[1] : ip.trim());
  if (n4 !== null) {
    let lo = 0;
    let hi = t.v4Od.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (t.v4Od[m] > n4) hi = m - 1;
      else if (t.v4Do[m] < n4) lo = m + 1;
      else return t.kody[t.v4Kraj[m]];
    }
    return null;
  }
  const n6 = ipv6NaLiczbe(ip);
  if (!n6) return null;
  let lo = 0;
  let hi = t.v6OdHi.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (porownaj(t.v6OdHi[m], t.v6OdLo[m], n6[0], n6[1]) > 0) hi = m - 1;
    else if (porownaj(t.v6DoHi[m], t.v6DoLo[m], n6[0], n6[1]) < 0) lo = m + 1;
    else return t.kody[t.v6Kraj[m]];
  }
  return null;
}

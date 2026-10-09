import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { isIP } from 'net';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isPrivateOrReservedIp, wczytajZastrzezoneZakresy } from './webhook-post.js';

/**
 * 09.10 (decyzja Dominika) — jedna lista zakazanych zakresów dla API i guarda węzła.
 * Źródło: ops/scripts/lib/zastrzezone-zakresy.txt. API czyta plik, guard (bash bez Node/jq)
 * ma kopię w tablicy VG_ZASTRZEZONE. Wcześniej guard przepuszczał m.in. NAT64 64:ff9b::/96,
 * 6to4 2002::/16, Teredo, 192.0.0.0/24 i 198.18.0.0/15, które API odrzucało.
 */
const KORZEN = resolve(import.meta.dirname, '../../../../..');
const PLIK = resolve(KORZEN, 'ops/scripts/lib/zastrzezone-zakresy.txt');
const GUARD = resolve(KORZEN, 'ops/scripts/lib/migration-input-guard.sh');

const liniePliku = () =>
  readFileSync(PLIK, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);

/** Werdykt guarda (vg_ip_prywatny) dla wielu adresów w jednym procesie bash: true = odmowa. */
function werdyktyGuarda(adresy: string[]): boolean[] {
  const out = execFileSync(
    'bash',
    ['-c', 'source "$1" || exit 9; while IFS= read -r ip; do if vg_ip_prywatny "$ip"; then echo 1; else echo 0; fi; done', '_', GUARD],
    { input: adresy.join('\n') + '\n', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 },
  );
  return out.toString().trim().split('\n').map((l) => l === '1');
}

const MAX = { 4: (1n << 32n) - 1n, 6: (1n << 128n) - 1n } as const;

function naLiczbe(ip: string): bigint {
  if (isIP(ip) === 4) return ip.split('.').reduce((a, o) => (a << 8n) | BigInt(o), 0n);
  const [l, p = ''] = ip.includes('::') ? ip.split('::') : [ip, undefined as unknown as string];
  const L = l ? l.split(':') : [];
  const P = ip.includes('::') && p ? p.split(':') : [];
  const grupy = ip.includes('::') ? [...L, ...Array(8 - L.length - P.length).fill('0'), ...P] : L;
  return grupy.reduce((a, g) => (a << 16n) | BigInt(parseInt(g, 16)), 0n);
}

function zLiczby(n: bigint, rodzina: 4 | 6): string {
  if (rodzina === 4) return [24n, 16n, 8n, 0n].map((s) => String((n >> s) & 255n)).join('.');
  return Array.from({ length: 8 }, (_, i) => ((n >> BigInt(112 - 16 * i)) & 0xffffn).toString(16)).join(':');
}

/** Pierwszy i ostatni adres każdego zakresu oraz sąsiedzi tuż za granicami. */
function probkiGraniczne(): string[] {
  const out: string[] = [];
  for (const z of liniePliku()) {
    const [adres, p] = z.split('/');
    const rodzina = isIP(adres) as 4 | 6;
    const bity = rodzina === 4 ? 32n : 128n;
    const host = (1n << (bity - BigInt(p))) - 1n;
    const start = naLiczbe(adres) & (MAX[rodzina] ^ host);
    const koniec = start | host;
    for (const n of [start - 1n, start, start + 1n, koniec - 1n, koniec, koniec + 1n]) {
      if (n >= 0n && n <= MAX[rodzina]) out.push(zLiczby(n, rodzina));
    }
  }
  return out;
}

/** Deterministyczne „losowe” adresy (LCG ze stałym ziarnem) — powtarzalny wynik testu. */
function probkiLosowe(ile: number): string[] {
  let x = 0x2545f491n;
  const nast = () => (x = (x * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n));
  const out: string[] = [];
  for (let i = 0; i < ile; i++) {
    out.push(zLiczby(nast() >> 32n, 4));
    // IPv6: górne 16 bitów z małego zbioru prefiksów, żeby trafiać też w zakresy (2001::, 2002::, 64:ff9b::, fe80::…)
    const pref = [0x0n, 0x64n, 0x100n, 0x2001n, 0x2002n, 0x2a01n, 0xfc00n, 0xfe80n, 0xff02n][Number(nast() % 9n)];
    out.push(zLiczby((pref << 112n) | ((nast() << 64n) | nast()) & ((1n << 112n) - 1n), 6));
  }
  return out;
}

const RECZNE = [
  '127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '198.18.0.1',
  '192.0.2.10', '192.0.0.8', '224.0.0.1', '255.255.255.255', '8.8.8.8', '1.1.1.1', '140.82.121.33', '100.128.0.1',
  '::1', '::', '::2', 'fe80::1', 'febf::1', 'fec0::1', 'fd00::5', 'ff02::1', 'FE80::1',
  '::ffff:127.0.0.1', '::ffff:8.8.8.8', '::ffff:169.254.169.254', '::ffff:7f00:1', '::FFFF:10.0.0.1', '::ffff:808:808', '0:0:0:0:0:ffff:7f00:1', '0:0:0:0:0:ffff:808:808', '::ffff:0:7f00:1',
  '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b::127.0.0.1', '64:ff9b::8.8.8.8', '64:ff9b:1::1', '2002:7f00:1::1',
  '2002:808:808::1', '2001:0:4136:e378::1', '2001:db8::1', '100::1',
  '2a01:4f9:c014:da28::1', '2606:4700::1111', '2001:4860:4860::8888', '2001:4860:4860:0:0:0:0:8888',
  'nie-adres', '', '1.2.3', '010.0.0.1', '256.1.1.1', '1::2::3', '1:2:3:4:5:6:7:8:9', 'fe80::1%eth0', '2130706433',
  // Przegląd 09.10: ostatni pusty element po `read -a` znikał — „1::2:” guard brał za publiczne 1::2.
  '1::2:', '2001:4860::8888:', '2001:4860::8888:1:', ':1::2', '1:2:3:4:5:6:7:8:',
];

describe('jedna lista zakazanych zakresów (ops/scripts/lib/zastrzezone-zakresy.txt)', () => {
  it('tablica VG_ZASTRZEZONE w guardzie węzła = linie pliku źródłowego (w tej samej kolejności)', () => {
    const guard = readFileSync(GUARD, 'utf8');
    const blok = /^readonly -a VG_ZASTRZEZONE=\(\n([\s\S]*?)\n\)$/m.exec(guard);
    expect(blok, 'brak tablicy VG_ZASTRZEZONE w migration-input-guard.sh').not.toBeNull();
    const wGuardzie = blok![1].split('\n').map((l) => l.trim()).filter(Boolean);
    expect(wGuardzie, 'przepisz linie z zastrzezone-zakresy.txt do VG_ZASTRZEZONE i wgraj guard na węzły').toEqual(liniePliku());
  });

  it('API buduje listę z tego pliku (te same wpisy), a zły wpis zatrzymuje start', () => {
    expect(wczytajZastrzezoneZakresy().map((z) => `${z.adres}/${z.prefiks}`)).toEqual(liniePliku());
    expect(() => wczytajZastrzezoneZakresy('10.0.0.0/8\n10.0.0.0/33\n')).toThrow('zastrzezone-zakresy.txt');
    expect(() => wczytajZastrzezoneZakresy('# same komentarze\n')).toThrow('pusta lista');
  });

  it('lista obejmuje zakresy z decyzji 09.10 (NAT64, 6to4, CGNAT, link-local, metadane)', () => {
    for (const z of ['64:ff9b::/96', '2002::/16', '100.64.0.0/10', '169.254.0.0/16', 'fe80::/10', '2001::/32']) {
      expect(liniePliku()).toContain(z);
    }
  });

  it('guard węzła i API wydają ten sam werdykt (granice każdego zakresu, przypadki ręczne, 400 losowych)', () => {
    const probki = [...RECZNE, ...probkiGraniczne(), ...probkiLosowe(200)];
    const bash = werdyktyGuarda(probki);
    expect(bash).toHaveLength(probki.length);
    const rozjazdy = probki.flatMap((ip, i) => (bash[i] !== isPrivateOrReservedIp(ip) ? [`${ip} (guard: ${bash[i]}, API: ${!bash[i]})`] : []));
    expect(rozjazdy).toEqual([]);
  });

  it.each([
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1', '2002:a9fe:a9fe::', '::ffff:169.254.169.254', '::ffff:7f00:1',
    '100.64.0.1', '169.254.169.254', 'fe80::1', '192.0.0.8', '198.18.0.1', '2001:0:4136:e378::1',
  ])('guard odrzuca %s (wcześniej przepuszczał część z nich)', (ip) => {
    expect(werdyktyGuarda([ip])).toEqual([true]);
  });
});

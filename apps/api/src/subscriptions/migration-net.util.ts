import { BadRequestException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { isPrivateOrReservedIp } from '../common/net/webhook-post.js';
import { adresyControlPlane } from '../servers/podpis-skryptow.js';

/**
 * Wspólne pomocniki sieciowe migratora (discovery + preflight).
 * Ochrona SSRF: klient podaje dowolny host, a łączy się z nim nasz backend —
 * dlatego każdy host musi rozwiązywać się wyłącznie na publiczne IP.
 */

/** Ta sama lista co webhooki i sondy (common/net/webhook-post.ts) — jedno źródło prawdy o SSRF. */
export function isPrivateIp(ip: string): boolean {
  return isPrivateOrReservedIp(ip);
}

/**
 * Z-09 (08.10) — adres samego control-plane'u (VERRIS_CONTROL_PLANE_IPS, adresy i sieci).
 * API łączy się z hostem klienta z control-plane'u; połączenie na własny publiczny adres idzie
 * lokalnie i omija zaporę, więc jest zakazane jak 127.0.0.1. Adresy węzła odrzuca guard na węźle.
 * W produkcji pusta lista zatrzymuje start API (sprawdzKonfiguracjeWezlow, 09.10).
 */
export function isControlPlaneIp(ip: string): boolean {
  return naLiscie(ip, adresyControlPlane().split(',').filter(Boolean));
}

/** Adres (także ::ffff:a.b.c.d) należy do listy adresów/sieci (CIDR). Wpisy niebędące IP pomijamy. */
function naLiscie(ip: string, lista: string[]): boolean {
  if (!lista.length) return false;
  const blokada = new net.BlockList();
  for (const wpis of lista) {
    const [adres, maska] = wpis.split('/');
    const wersja = net.isIP(adres);
    if (!wersja) continue;
    const typ = wersja === 6 ? 'ipv6' : 'ipv4';
    if (maska === undefined) blokada.addAddress(adres, typ);
    else blokada.addSubnet(adres, Number(maska), typ);
  }
  const lower = ip.toLowerCase();
  const v4 = lower.startsWith('::ffff:') && net.isIP(lower.slice(7)) === 4 ? lower.slice(7) : null;
  if (v4) return blokada.check(v4, 'ipv4');
  const wersja = net.isIP(lower);
  if (!wersja) return false;
  return blokada.check(lower, wersja === 6 ? 'ipv6' : 'ipv4');
}

/**
 * 09.10 — adresy węzłów hostingu z bazy (Server.ipAddress / ipv6Address). Control-plane łączy się
 * z węzłami z adresu, który zapora węzła wpuszcza na panel :2222, SSH i MariaDB — host „starego
 * hostingu” wskazujący na węzeł dawałby klientowi te porty z naszego zaufanego adresu. Blokada
 * nie zależy od VERRIS_CONTROL_PLANE_IPS. Źródło rejestruje AdresyWezlowRejestr (Prisma) przy
 * starcie modułu; w produkcji brak źródła = odmowa (fail-closed), w testach = pusta lista.
 */
type ZrodloAdresowWezlow = () => Promise<Array<string | null | undefined>>;
let zrodloWezlow: ZrodloAdresowWezlow | null = null;

export function ustawZrodloAdresowWezlow(zrodlo: ZrodloAdresowWezlow | null): void {
  zrodloWezlow = zrodlo;
}

async function adresyWezlow(): Promise<string[]> {
  if (!zrodloWezlow) {
    if (process.env.NODE_ENV === 'production') throw new BadRequestException('Nie można teraz sprawdzić hosta — spróbuj ponownie za chwilę.');
    return [];
  }
  return (await zrodloWezlow()).filter((a): a is string => !!a && !!a.trim()).map((a) => a.trim());
}

function odrzucZakazany(ip: string, wezly: string[]): void {
  if (isPrivateIp(ip)) throw new BadRequestException('Host wskazuje na sieć prywatną — odrzucono.');
  if (isControlPlaneIp(ip) || naLiscie(ip, wezly)) throw new BadRequestException('Host wskazuje na serwer Verris — podaj adres starego hostingu.');
}

export async function assertPublicHost(host: string): Promise<void> {
  await resolvePublicHost(host);
}

/**
 * `wezly: 'dozwolone'` — wyłącznie dla sond stron klientów (site-monitor): domena klienta
 * hostowanej u nas strony wskazuje na węzeł i to jest jej poprawny adres. Migrator i discovery
 * (host „starego hostingu”) używają domyślnego `'zakazane'`.
 */
export interface OpcjeHosta {
  wezly?: 'zakazane' | 'dozwolone';
}

/**
 * Rozwiązuje host i zwraca JEDEN, zweryfikowany jako publiczny adres IP.
 *
 * Ochrona przed DNS-rebindingiem (TOCTOU): zamiast sprawdzać publiczność hosta,
 * a potem łączyć się po nazwie (co daje serwerowi DNS drugą szansę zwrócić
 * adres prywatny), rozwiązujemy raz i łączymy się DOKŁADNIE z tym adresem
 * (servername/Host zostają oryginalną nazwą — dla SNI i weryfikacji panelu).
 * Preferujemy IPv4 (szersza zgodność paneli hostingowych).
 */
export async function resolvePublicHost(host: string, opcje: OpcjeHosta = {}): Promise<string> {
  if (!host || host.length > 253) throw new BadRequestException('Niepoprawny host.');
  const wezly = opcje.wezly === 'dozwolone' ? [] : await adresyWezlow();
  if (net.isIP(host)) {
    odrzucZakazany(host, wezly);
    return host;
  }
  const [v4, v6] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
  ]);
  const addresses = [...v4, ...v6];
  if (addresses.length === 0) {
    throw new BadRequestException(`Nie można rozwiązać nazwy hosta: ${host}`);
  }
  for (const ip of addresses) odrzucZakazany(ip, wezly);
  return v4[0] ?? addresses[0];
}

export function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

import { BadRequestException } from '@nestjs/common';
import * as net from 'node:net';
import { adresyControlPlane } from '../../servers/podpis-skryptow.js';

/**
 * Adresy serwerów Verris, z którymi API nie łączy się w imieniu klienta (SSRF): control-plane
 * (VERRIS_CONTROL_PLANE_IPS) i węzły (Server.ipAddress / ipv6Address z bazy). Wspólne dla strażnika
 * migratora (subscriptions/migration-net.util) i kontroli w chwili połączenia (webhook-post.ts,
 * lookupBezpieczny) — 10.10 (D12) przeniesione tu z migration-net.util bez zmiany działania.
 */

/**
 * Z-09 (08.10) — adres samego control-plane'u (VERRIS_CONTROL_PLANE_IPS, adresy i sieci).
 * API łączy się z hostem klienta z control-plane'u; połączenie na własny publiczny adres idzie
 * lokalnie i omija zaporę, więc jest zakazane jak 127.0.0.1.
 * W produkcji pusta lista zatrzymuje start API (sprawdzKonfiguracjeWezlow, 09.10).
 */
export function isControlPlaneIp(ip: string): boolean {
  return naLiscie(ip, adresyControlPlane().split(',').filter(Boolean));
}

/** Adres (także ::ffff:a.b.c.d) należy do listy adresów/sieci (CIDR). Wpisy niebędące IP pomijamy. */
export function naLiscie(ip: string, lista: string[]): boolean {
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
 * z węzłami z adresu, który zapora węzła wpuszcza na panel :2222, SSH i MariaDB — host wskazujący
 * na węzeł dawałby klientowi te porty z naszego zaufanego adresu. Blokada nie zależy od
 * VERRIS_CONTROL_PLANE_IPS. Źródło rejestruje AdresyWezlowRejestr (Prisma) przy starcie modułu;
 * w produkcji brak źródła = odmowa (fail-closed), w testach = pusta lista.
 */
type ZrodloAdresowWezlow = () => Promise<Array<string | null | undefined>>;
let zrodloWezlow: ZrodloAdresowWezlow | null = null;

export function ustawZrodloAdresowWezlow(zrodlo: ZrodloAdresowWezlow | null): void {
  zrodloWezlow = zrodlo;
}

export async function adresyWezlow(): Promise<string[]> {
  if (!zrodloWezlow) {
    if (process.env.NODE_ENV === 'production') throw new BadRequestException('Nie można teraz sprawdzić hosta — spróbuj ponownie za chwilę.');
    return [];
  }
  return (await zrodloWezlow()).filter((a): a is string => !!a && !!a.trim()).map((a) => a.trim());
}

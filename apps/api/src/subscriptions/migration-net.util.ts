import { BadRequestException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { isPrivateOrReservedIp } from '../common/net/webhook-post.js';

/**
 * Wspólne pomocniki sieciowe migratora (discovery + preflight).
 * Ochrona SSRF: klient podaje dowolny host, a łączy się z nim nasz backend —
 * dlatego każdy host musi rozwiązywać się wyłącznie na publiczne IP.
 */

/** Ta sama lista co webhooki i sondy (common/net/webhook-post.ts) — jedno źródło prawdy o SSRF. */
export function isPrivateIp(ip: string): boolean {
  return isPrivateOrReservedIp(ip);
}

export async function assertPublicHost(host: string): Promise<void> {
  await resolvePublicHost(host);
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
export async function resolvePublicHost(host: string): Promise<string> {
  if (!host || host.length > 253) throw new BadRequestException('Niepoprawny host.');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new BadRequestException('Host wskazuje na sieć prywatną — odrzucono.');
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
  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      throw new BadRequestException('Host wskazuje na sieć prywatną — odrzucono.');
    }
  }
  return v4[0] ?? addresses[0];
}

export function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

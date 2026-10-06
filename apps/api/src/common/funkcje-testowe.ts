import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Funkcje włączane z env API per konto — test na kontach testowych przed udostępnieniem wszystkim
 * (wzór: AI_TYLKO_KONTA). `<NAZWA>=true` = wszyscy; `<NAZWA>_TYLKO_KONTA` = e-maile po przecinku —
 * gdy ustawione, funkcja TYLKO dla tych kont (niezależnie od `<NAZWA>`). Brak obu = wyłączona.
 * Panel klienta dostaje wynik w `/me/feature-flags`, więc nie zależy od argumentów buildu obrazu.
 */
export type FunkcjaTestowa = 'FEATURE_VPS' | 'FEATURE_RESELLER_MARKUP';

type Konfig = Pick<ConfigService, 'get'>;

function konta(config: Konfig, f: FunkcjaTestowa): string[] {
  return (config.get<string>(`${f}_TYLKO_KONTA`) ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@')); // wpis bez „@” (np. pomyłkowe „true”) nie jest kontem — ignorowany
}

const dlaWszystkich = (config: Konfig, f: FunkcjaTestowa) => (config.get<string>(f) ?? '').trim().toLowerCase() === 'true';

/** false = funkcja wyłączona dla każdego konta (można pominąć zapytania do bazy). */
export function funkcjaMozliwa(config: Konfig, f: FunkcjaTestowa): boolean {
  return konta(config, f).length > 0 || dlaWszystkich(config, f);
}

export function funkcjaDlaKonta(config: Konfig, f: FunkcjaTestowa, email: string | null | undefined): boolean {
  const lista = konta(config, f);
  if (!lista.length) return dlaWszystkich(config, f);
  return !!email && lista.includes(email.trim().toLowerCase());
}

/** Jak `funkcjaDlaKonta`, po id konta (subkonto działa jako właściciel — `req.user.userId`). */
export async function funkcjaDlaUzytkownika(
  config: Konfig,
  prisma: Pick<PrismaService, 'user'>,
  f: FunkcjaTestowa,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!konta(config, f).length) return dlaWszystkich(config, f);
  const u = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }) : null;
  return funkcjaDlaKonta(config, f, u?.email);
}

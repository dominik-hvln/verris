/**
 * D10 (decyzja 10.10) — wymuszenie 2FA dla zespołu (ADMIN/STAFF) przy logowaniu hasłem.
 *
 * Obowiązuje, gdy zmienna REQUIRE_2FA_FOR_STAFF jest włączona (twarde włączenie — panel go nie wyłączy)
 * ALBO administrator włączył przełącznik w panelu (ustawienie platformy `security.require2faForStaff`).
 * Odczyt prosto z tabeli ustawień, bez pamięci podręcznej: wyłączenie w panelu działa od następnego logowania.
 */
export const KLUCZ_WYMOGU_2FA = 'security.require2faForStaff';

/** Zmienna środowiskowa wymusza 2FA: „1” (dotychczasowa wartość w docker-compose) albo „true”. */
export function wymog2faZEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.REQUIRE_2FA_FOR_STAFF ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

export interface StanWymogu2fa {
  /** Przełącznik w panelu. */
  wlaczony: boolean;
  /** REQUIRE_2FA_FOR_STAFF — panel nie może wyłączyć. */
  wymuszonyEnv: boolean;
  /** Czy wymóg obowiązuje przy logowaniu. */
  obowiazuje: boolean;
}

export async function stanWymogu2fa(
  prisma: { platformSetting: { findUnique(args: { where: { key: string }; select: { value: true } }): Promise<{ value: string } | null> } },
  env: NodeJS.ProcessEnv = process.env,
): Promise<StanWymogu2fa> {
  const wymuszonyEnv = wymog2faZEnv(env);
  const wiersz = await prisma.platformSetting.findUnique({ where: { key: KLUCZ_WYMOGU_2FA }, select: { value: true } });
  const wlaczony = wiersz?.value === '1';
  return { wlaczony, wymuszonyEnv, obowiazuje: wymuszonyEnv || wlaczony };
}

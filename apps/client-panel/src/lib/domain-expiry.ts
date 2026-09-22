/**
 * Domena „do odnowienia": koniec rejestracji w ciągu 30 dni (albo już minął).
 * Osobny moduł, bo `rail-actions.ts` to 'use server' — tam mogą być wyłącznie
 * funkcje async, a ten helper wołamy też w komponencie klienckim.
 */
export function isExpiringSoon(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t - now < 30 * 86_400_000;
}

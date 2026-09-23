import { createHash } from 'node:crypto';

/**
 * N-12 — ocena flagi funkcji dla klienta. Do 2026-09-23 operator mógł flagi
 * zakładać, ale nic ich nie czytało (funkcja-widmo). Teraz steruje nimi widoczność
 * modułów panelu klienta (patrz FLAGI_MODULOW w libs/contracts).
 *
 * Kolejność: okno czasowe → nadpisanie klienta (nie wygasłe) → nadpisanie planu
 * (dowolny aktywny plan klienta z „włączone” wygrywa nad „wyłączone”) → domyślne
 * „włączone” → rollout procentowy (stabilny hash klucz+klient, ten sam wynik przy
 * każdym odświeżeniu).
 */
export interface FlagaDoOceny {
  key: string;
  enabledDefault: boolean;
  rolloutPercent: number;
  startsAt: Date | null;
  endsAt: Date | null;
  overrides: Array<{ userId: string; enabled: boolean; expiresAt: Date | null }>;
  planOverrides: Array<{ planId: string; enabled: boolean }>;
}

export function kubelek(klucz: string, userId: string): number {
  return createHash('sha256').update(`${klucz}:${userId}`).digest().readUInt32BE(0) % 100;
}

export function ocenFlage(f: FlagaDoOceny, userId: string, planIds: string[], teraz: Date): boolean {
  if ((f.startsAt && teraz < f.startsAt) || (f.endsAt && teraz >= f.endsAt)) return false;
  const o = f.overrides.find((x) => x.userId === userId && (!x.expiresAt || x.expiresAt > teraz));
  if (o) return o.enabled;
  const p = f.planOverrides.filter((x) => planIds.includes(x.planId));
  if (p.length > 0) return p.some((x) => x.enabled);
  if (f.enabledDefault) return true;
  return kubelek(f.key, userId) < Math.max(0, Math.min(100, f.rolloutPercent));
}

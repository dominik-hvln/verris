/** Odpowiedź GET /admin/zadania-w-tle (F2.8, apps/api/src/zadania-w-tle). */
export interface StanZadania {
  klucz: string;
  nazwa: string | null;
  harmonogram: string;
  strefa: string | null;
  ostatni: { start: string; koniec: string; czasMs: number; ok: boolean; blad: string | null; reczne: boolean } | null;
  ostatniBlad: { start: string; blad: string | null } | null;
  nastepny: string | null;
  trwaOd: string | null;
  zalegle: boolean;
  mozeUruchomic: boolean;
}

export type Ocena = "zalegle" | "blad" | "ok" | "brak";

/** Najpierw to, co wymaga reakcji: nie biegnie, ostatni przebieg z błędem; potem bez przebiegu i sprawne. */
export function ocena(z: StanZadania): Ocena {
  if (z.zalegle) return "zalegle";
  if (z.ostatni && !z.ostatni.ok) return "blad";
  return z.ostatni ? "ok" : "brak";
}

const KOLEJNOSC: Record<Ocena, number> = { zalegle: 0, blad: 1, brak: 2, ok: 3 };

export function posortuj(lista: StanZadania[]): StanZadania[] {
  return [...lista].sort((a, b) => KOLEJNOSC[ocena(a)] - KOLEJNOSC[ocena(b)] || a.klucz.localeCompare(b.klucz));
}

export function czasTrwania(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}

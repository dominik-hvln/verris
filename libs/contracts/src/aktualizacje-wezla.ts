/**
 * 21.10 — weryfikator aktualizacji bezpieczeństwa węzłów. Raport agenta `ops/scripts/verris-lve.sh` (co ~6 h oraz od razu
 * po instalacji poprawek), zapisywany w Server.aktualizacje. Wspólny kształt dla telemetrii (API), alertów i panelu admina.
 */
export const WAGI_POPRAWEK = ['Critical', 'Important', 'Moderate', 'Low', 'Unknown'] as const;
export type WagaPoprawki = (typeof WAGI_POPRAWEK)[number];

/** Wagi, przy których admin dostaje alarm (panel + e-mail + push). */
export const WAGI_ALARMU: readonly WagaPoprawki[] = ['Critical', 'Important'];

/** Jedna oczekująca poprawka z `dnf updateinfo` (advisory ALSA-/RHSA-/CLSA-…, waga, pakiet, numery CVE). */
export interface PoprawkaDnf {
  advisory: string;
  waga: WagaPoprawki;
  /** pełna nazwa pakietu z wersją, np. alt-php83-cli-8.3.12-1.el10.x86_64 */
  pakiet: string;
  cve: string[];
}

/** Składnik CustomBuild z dostępną nowszą wersją (`./build versions`: „X a to b update is available.”). */
export interface AktualizacjaCustomBuild {
  nazwa: string;
  z: string;
  na: string;
}

export interface StanAktualizacjiWezla {
  /** ISO — kiedy węzeł sprawdził (czas węzła). */
  sprawdzono: string;
  dnf: { poprawki: PoprawkaDnf[]; blad?: string };
  /** null — węzeł bez CustomBuild. */
  custombuild: { aktualizacje: AktualizacjaCustomBuild[]; blad?: string } | null;
  /** wersja główna alt-php → pełna wersja zainstalowana, np. { "8.3": "8.3.11" } */
  altPhp: Record<string, string>;
}

/** Limity raportu (agent przycina, API odrzuca nadmiar). */
export const MAKS_POPRAWEK_W_RAPORCIE = 500;
export const MAKS_CVE_NA_POPRAWKE = 50;

export const CVE_RE = /^CVE-\d{4}-\d{4,7}$/;

/** Numer CVE z wyszukiwarki panelu → postać kanoniczna (wielkie litery, bez spacji) albo null. */
export function normalizujCve(tekst: string): string | null {
  const t = tekst.trim().toUpperCase();
  return CVE_RE.test(t) ? t : null;
}

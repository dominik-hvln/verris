/**
 * H-04 — kopie konta poza serwerem (off-site, node-offsite-backup.sh): wersja z każdego dnia przez tyle
 * dni, klient sam wybiera dzień i przywraca z panelu. Ta sama liczba stoi w panelu i na verris.pl;
 * zgodność z RETENTION_DAYS w skrypcie węzła pilnuje apps/api/src/test/kopie-30-dni.spec.ts.
 * To także minimum retencji w cenie każdego planu (rynek: 28 dni) — krócej nie ustawi ani klient, ani węzeł.
 */
export const KOPIE_OFFSITE_DNI = 30;

/**
 * H-03 — najdłuższa retencja kopii poza serwerem, jaką plan może dać klientowi. Regulamin §10 ust. 8 i DPA
 * §10 ust. 1: kopie z danymi są usuwane „w cyklu rotacji nie dłuższym niż 90 dni” — dłużej nie trzyma węzeł.
 */
export const KOPIE_OFFSITE_MAX_DNI = 90;

/** Najdłuższa retencja, jaką daje plan: jego ustawienie przycięte do [KOPIE_OFFSITE_DNI, KOPIE_OFFSITE_MAX_DNI]. */
export function sufitRetencjiOffsite(planMaxDni: number | null | undefined): number {
  const n = Math.trunc(Number(planMaxDni));
  if (!Number.isFinite(n)) return KOPIE_OFFSITE_DNI;
  return Math.min(KOPIE_OFFSITE_MAX_DNI, Math.max(KOPIE_OFFSITE_DNI, n));
}

/**
 * Retencja, którą faktycznie stosuje węzeł: wybór klienta w granicach planu. Po zmianie planu na niższy
 * wybór powyżej nowego sufitu spada do sufitu; nigdy poniżej KOPIE_OFFSITE_DNI.
 */
export function retencjaOffsiteDni(wybranaDni: number | null | undefined, planMaxDni: number | null | undefined): number {
  const n = Math.trunc(Number(wybranaDni));
  const wybrana = Number.isFinite(n) ? n : KOPIE_OFFSITE_DNI;
  return Math.min(sufitRetencjiOffsite(planMaxDni), Math.max(KOPIE_OFFSITE_DNI, wybrana));
}

/**
 * F3.3 — po ilu dniach bez udanej kopii poza serwerem konto jest „bez świeżej kopii” (widok „Kopie floty”, metryka
 * verris_backup_accounts_stale i alert w Grafanie). Węzeł robi kopię raz na dobę (03:30), więc 2 dni = jeden
 * opuszczony przebieg zapasu.
 */
export const KOPIA_KONTA_ALERT_DNI = 2;

/**
 * Weryfikacja 11.10 — pozycja listy „Kopia do odtworzenia”: nazwa archiwum, data zapisu i rozmiar. Nazwy potrafią się
 * powtarzać (user.admin.<login>.tar.zst nadpisywany kolejną kopią), więc sama nazwa nie mówi, którą wersję się odtwarza.
 * Daty i rozmiaru brak (null) — gdy węzeł ich nie podał; wtedy sama nazwa.
 */
export type KopiaZMetadanymi = { id: string; fileName: string; utworzono?: string | null; rozmiarBajty?: number | null };

export function rozmiarKopii(bajty: number): string {
  const jednostki = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bajty;
  let i = 0;
  while (n >= 1024 && i < jednostki.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString('pl-PL', { maximumFractionDigits: i === 0 ? 0 : 1 })} ${jednostki[i]}`;
}

export function opisKopii(k: KopiaZMetadanymi): string {
  const data = k.utworzono
    ? new Date(k.utworzono).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  return [k.fileName, data, k.rozmiarBajty != null ? rozmiarKopii(k.rozmiarBajty) : null].filter(Boolean).join(' · ');
}

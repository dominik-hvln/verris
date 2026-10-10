/**
 * F2.6 — nazwy zasobów, w które konto odbija się limitem (faulty z raportu węzła, apps/api/src/telemetry/faulty-lve.ts).
 * Wspólne dla karty usługi i listy przekroczeń floty.
 */
export type Faulty = { cpu: number; ep: number; nproc: number; pmem: number; io: number; iops: number };

export const ZASOBY: { klucz: keyof Faulty; nazwa: string; skutek: string }[] = [
  { klucz: "ep", nazwa: "Procesy wejściowe (EP)", skutek: "odwiedzający dostają błąd 508" },
  { klucz: "nproc", nazwa: "Procesy (NPROC)", skutek: "nowe procesy PHP i cron nie startują" },
  { klucz: "pmem", nazwa: "Pamięć (PMEM)", skutek: "procesy są zabijane — błędy 500/503" },
  { klucz: "cpu", nazwa: "CPU", skutek: "strona zwalnia (dławienie)" },
  { klucz: "io", nazwa: "I/O", skutek: "strona zwalnia przy dysku" },
  { klucz: "iops", nazwa: "IOPS", skutek: "strona zwalnia przy dysku" },
];

const KROTKO: Record<keyof Faulty, string> = { ep: "EP", nproc: "NPROC", pmem: "PMEM", cpu: "CPU", io: "IO", iops: "IOPS" };

export const sumaFaultow = (f: Faulty | null) => (f ? ZASOBY.reduce((s, z) => s + f[z.klucz], 0) : 0);

/** „EP 25 · NPROC 1” — tylko zasoby z faultami; bez faultów „0”. */
export function krotkoFaulty(f: Faulty | null): string {
  if (!f) return "—";
  const czesci = ZASOBY.filter((z) => f[z.klucz] > 0).map((z) => `${KROTKO[z.klucz]} ${f[z.klucz].toLocaleString("pl-PL")}`);
  return czesci.length ? czesci.join(" · ") : "0";
}

/** Opis stanu raportu węzła — operator widzi szczegóły (to panel operatora, nie klienta). */
export function stanRaportu(r: { odczytano: string | null; nieaktualne: boolean; blad: string | null }, teraz: number): { ton: "ok" | "warn" | "crit"; tekst: string } {
  if (r.blad) return { ton: "crit", tekst: `Węzeł nie odczytał faultów: ${r.blad}` };
  if (!r.odczytano) return { ton: "warn", tekst: "Brak raportu faultów z węzła — agent verris-lve sprzed F2.6 (potrzebny redeploy agenta)." };
  const min = Math.max(0, Math.round((teraz - Date.parse(r.odczytano)) / 60_000));
  const kiedy = min < 1 ? "przed chwilą" : min < 120 ? `${min} min temu` : `${Math.round(min / 60)} h temu`;
  return r.nieaktualne ? { ton: "warn", tekst: `Raport nieaktualny (${kiedy}) — agent przestał raportować.` } : { ton: "ok", tekst: `Raport węzła ${kiedy}.` };
}

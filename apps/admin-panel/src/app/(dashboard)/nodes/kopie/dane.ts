/** Odpowiedź GET /admin/live-readiness/proby-odtworzenia (H-20, model RestoreDrill; 50 ostatnich) — tylko ADMIN. */
export interface ProbaOdtworzenia {
  id: string;
  finishedAt: string;
  durationSec: number;
  result: "OK" | "FAILED";
  objectName: string;
  source: string;
  owner: string;
  notes: string | null;
  rowCounts: Record<string, number> | null;
}

export type StanKopiiKonta = "ok" | "nowe" | "nieudana" | "przeterminowana" | "brak";

/** F3.3 — odpowiedź GET /admin/servers/kopie[?wezel=] (apps/api/src/servers/kopie-floty.ts). */
export interface KopieFloty {
  progDni: number;
  harmonogram: { godzina: string; rozrzutMin: number; opis: string };
  offsite: { skonfigurowany: true; retencjaDni: number; zmienionoAt: string | null } | { skonfigurowany: false };
  bazaPanelu: { obecna: true; kiedy: string; wiekS: number; rozmiar: number } | { obecna: false };
  wezly: Array<{
    id: string;
    nazwa: string;
    status: string;
    przebieg: { kiedy: string; ok: boolean; konta: number | null; bajty: number | null; czasS: number | null; opis: string | null } | null;
    nieaktualny: boolean;
    konta: { kont: number; ok: number; nowe: number; nieudane: number; bezSwiezej: number; wlasnaRetencja: number };
  }>;
  podsumowanie: { kont: number; ok: number; nowe: number; nieudane: number; przeterminowane: number; bezKopii: number; lokalneNieudane: number };
  konta: Array<{
    accountId: string;
    subscriptionId: string;
    domena: string;
    login: string;
    wezel: { id: string; nazwa: string };
    stan: StanKopiiKonta;
    ostatniaUdana: string | null;
    rozmiar: number | null;
    ostatniaNieudana: string | null;
    lokalnaNieudana: { kiedy: string | null; blad: string } | null;
  }>;
  kontUcietych: number;
  proby: Array<{ id: string; finishedAt: string; durationSec: number; result: "OK" | "FAILED"; objectName: string; source: string; owner: string }>;
}

export const ETYKIETA_STANU: Record<StanKopiiKonta, { tekst: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  ok: { tekst: "świeża", ton: "ok" },
  nowe: { tekst: "nowe konto", ton: "muted" },
  nieudana: { tekst: "nieudana", ton: "crit" },
  przeterminowana: { tekst: "stara", ton: "warn" },
  brak: { tekst: "brak kopii", ton: "crit" },
};

/** Rozmiar w jednostkach dziesiętnych (jak w panelu klienta i w raporcie węzła). */
export function rozmiar(b: number | null | undefined): string {
  if (b === null || b === undefined) return "—";
  if (b < 1000) return `${b} B`;
  const j = ["kB", "MB", "GB", "TB"];
  let v = b / 1000;
  let i = 0;
  while (v >= 1000 && i < j.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toLocaleString("pl-PL", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${j[i]}`;
}

/** Wiek w czytelnej postaci: „5 h”, „2 dni”. */
export function wiek(iso: string | null, teraz: number): string {
  if (!iso) return "—";
  const h = Math.max(0, Math.floor((teraz - new Date(iso).getTime()) / 3_600_000));
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} dni`;
}

import { adminApi } from "@/lib/api";

type Stan = "ok" | "warn" | "crit" | "brak";

/** Odpowiedź `GET /admin/servers/:id/przeglad` (PB-34, makieta AdminWezel). */
export interface PrzegladWezla {
  id: string;
  nazwa: string;
  region: string | null;
  ip: string;
  status: string;
  stan: "ok" | "warn" | "crit";
  poza: string | null;
  przyjmujeKonta: boolean;
  sygnal: string;
  naZywo: boolean;
  wersje: { cloudlinux: string | null; directadmin: string | null; manifest: string | null; agent: string | null };
  manifestFloty: string;
  zasoby: {
    cpu: { proc: number | null; rdzenie: number | null; sprzedane: number | null; limit: number };
    ram: { uzyteMb: number | null; razemMb: number | null; rezerwaProc: number };
    dysk: { uzyteMb: number | null; razemMb: number | null; przydzieloneMb: number };
    konta: { razem: number; limit: number | null; autoskalowane: number };
  };
  zgodnosc: {
    pozycje: { co: string; oczekiwane: string; faktyczne: string | null; zgodne: boolean | null }[];
    rozjazdy: number;
    bezRaportu: boolean;
  };
  gotowosc: { co: string; stan: Stan; opis: string; naprawa: string | null }[];
  doNaprawy: number;
  obciazone: { id: string; domena: string; plan: string | null; klient: string; klientId: string; autoskalowanieCpu: number; proc: number | null }[];
  zadania: { id: string; status: string; tekst: string; blad: string | null; at: string }[];
}

/** null — błąd API; karta pokazuje wtedy „Nie udało się wczytać zasobów węzła” (fala 1B), reszta karty działa. */
export async function fetchPrzegladWezla(id: string): Promise<PrzegladWezla | null> {
  try {
    return await adminApi<PrzegladWezla>(`/admin/servers/${id}/przeglad`);
  } catch {
    return null;
  }
}

type Zasob = "CPU" | "RAM" | "DISK" | "IO";
export interface SygnalPrognozy {
  ton: "warn" | "crit";
  tekst: string;
}
export interface ZapasPuli {
  kont: number;
  wymiar: string;
  noweKonta30d: number;
  dniDoWyczerpania: number | null;
}

/** Odpowiedź `GET /admin/servers/:id/prognoza` (apps/api/src/servers/prognoza-wezla.ts). */
export interface PrognozaWezla {
  generatedAt: string;
  dostepna: boolean;
  confidence: "low" | "medium" | "high";
  horizonDays: number;
  resources: { resource: Zasob; currentPct: number; predictedPct: number; daysToLimit: number | null; historia?: { t: string; v: number }[] }[];
  oknoAktualizacji: { godzina: number; cpuProc: number } | null;
  zapas: ZapasPuli | null;
  kandydaci: { etykieta: string; accountId: string; domena: string | null; subscriptionId: string | null; udzialProc: number; mocWezlaProc: number | null }[];
  sygnaly: SygnalPrognozy[];
  podsumowanie: string;
  zalecenia: string[];
  komentarzAi: boolean;
}

/** Prognoza to dodatek na Przeglądzie — przy błędzie karta jej nie pokazuje. */
export async function fetchPrognozaWezla(id: string): Promise<PrognozaWezla | null> {
  try {
    return await adminApi<PrognozaWezla>(`/admin/servers/${id}/prognoza`);
  } catch {
    return null;
  }
}

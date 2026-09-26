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

export async function fetchPrzegladWezla(id: string): Promise<PrzegladWezla | null> {
  try {
    return await adminApi<PrzegladWezla>(`/admin/servers/${id}/przeglad`);
  } catch {
    return null;
  }
}

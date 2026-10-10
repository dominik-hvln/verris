/** D11 — kształty odpowiedzi tablicy migracji (apps/api/src/subscriptions/tablica-migracji.service.ts). */

export type Etap = "NOWA" | "TESTY" | "DO_ZMIANY_DNS" | "PO_PRZELACZENIU" | "ZAMKNIETA";
export const ETAPY: { etap: Etap; nazwa: string }[] = [
  { etap: "NOWA", nazwa: "Nowa" },
  { etap: "TESTY", nazwa: "Testy u nas" },
  { etap: "DO_ZMIANY_DNS", nazwa: "Do zmiany DNS" },
  { etap: "PO_PRZELACZENIU", nazwa: "Po przełączeniu" },
  { etap: "ZAMKNIETA", nazwa: "Zamknięta" },
];
export const nazwaEtapu = (e: string) => ETAPY.find((x) => x.etap === e)?.nazwa ?? e;

export interface TerminMigracji {
  rodzaj: "sla" | "stary-hosting" | "domena" | "okno-poprawek";
  opis: string;
  data: string;
  stan: "ok" | "blisko" | "po-terminie";
}

export interface KartaMigracji {
  id: string;
  subscriptionId: string;
  domena: string;
  klient: string | null;
  etap: Etap;
  etapOd: string | null;
  status: string;
  statusOpis: string;
  needsAttention: boolean;
  przerywacz: boolean;
  przypisany: { id: string; email: string | null } | null;
  ticketId: string | null;
  termin: TerminMigracji | null;
  dalej: { etap: Etap; braki: string[] } | null;
}

export interface Tablica {
  etapy: { etap: Etap; nazwa: string }[];
  kolumny: Record<Etap, KartaMigracji[]>;
  alerty: { poTerminie: number; blisko: number };
}

export type PoleChecklisty = "ttl300" | "testTymczasowy" | "testPrzed" | "testPo" | "optymalizacja" | "podsumowanie";

export interface WpisOsi {
  typ: "kontakt" | "zdarzenie";
  id: string;
  at: string;
  kto: string | null;
  kanal?: "TELEFON" | "MAIL";
  tresc?: string;
  ticketId?: string | null;
  akcja?: string;
  szczegoly?: unknown;
}

export interface ObslugaMigracji {
  id: string;
  domena: string;
  etap: Etap;
  etapOd: string | null;
  status: string;
  statusOpis: string;
  cutoverAt: string | null;
  termin: string | null;
  terminDomyslny: string;
  wygasaUStaregoAt: string | null;
  domenaWygasaAt: string | null;
  przerywacz: boolean;
  przypisany: { id: string; email: string | null } | null;
  poprawkiDo: string | null;
  ticketId: string | null;
  raportWyslanyAt: string | null;
  checklista: Partial<Record<PoleChecklisty, { tekst?: string; at: string; przez: string | null }>>;
  terminStan: TerminMigracji | null;
  dalej: { etap: Etap; nazwa: string; braki: string[] } | null;
  brakiRaportu: string[];
  oknoPoprawekDni: number;
  operatorzy: { id: string; email: string }[];
  os: WpisOsi[];
}

export interface PodgladRaportu {
  braki: string[];
  temat: string | null;
  tekst: string | null;
}

const ZDARZENIA: Record<string, string> = {
  MIGRATION_STAGE_CHANGED: "Zmiana etapu",
  MIGRATION_HANDLING_UPDATED: "Zmiana terminów lub przypisania",
  MIGRATION_CHECKLIST_UPDATED: "Checklista",
  MIGRATION_CONTACT_LOGGED: "Kontakt z klientem",
  MIGRATION_REPORT_SENT: "Raport wysłany do klienta",
  MIGRATION_CUTOVER_DNS_APPLIED: "DNS przełączony",
  MIGRATION_CUTOVER_REQUESTED: "Sprawdzenie DNS",
  MIGRATION_BUNDLE_QUEUED: "Zlecenie przyjęte",
  MIGRATION_CONSENT_REQUESTED: "Prośba o zgodę klienta",
  MIGRATION_CONSENT_ACCEPTED: "Klient zgodził się",
  MIGRATION_CONSENT_REJECTED: "Klient odmówił",
  MIGRATION_CONSENT_EXPIRED: "Prośba o zgodę wygasła",
  MIGRATION_ESCALATED: "Automat zatrzymany — wymaga uwagi",
  MIGRATION_ATTENTION_RESOLVED: "Uwaga rozwiązana",
  MIGRATION_WORKER_JOB_QUEUED: "Krok w kolejce",
  MIGRATION_WORKER_JOB_STARTED: "Krok rozpoczęty",
  MIGRATION_WORKER_JOB_COMPLETED: "Krok zakończony",
  MIGRATION_WORKER_JOB_FAILED: "Krok nieudany",
  MIGRATION_WORKER_JOB_RETRIED: "Krok ponowiony",
  MIGRATION_DELTA_SYNC_QUEUED: "Dosynchronizowanie",
  MIGRATION_SECRETS_REVEALED: "Odsłonięto dane dostępowe",
  MIGRATION_SECRETS_PURGED: "Dane dostępowe usunięte",
  MIGRATION_CANCELED: "Anulowano",
};

const POLA: Record<string, string> = {
  ttl300: "TTL 300",
  testTymczasowy: "test na tymczasowym adresie",
  testPrzed: "test przed",
  testPo: "test po",
  optymalizacja: "optymalizacja",
  podsumowanie: "podsumowanie",
  termin: "termin",
  wygasaUStaregoAt: "wygaśnięcie u starego dostawcy",
  domenaWygasaAt: "wygaśnięcie domeny",
  przerywacz: "Przerywacz",
  przypisanyDoId: "prowadzący",
  ticketId: "zgłoszenie",
};

/** Opis wpisu osi czasu dla operatora: nazwa zdarzenia + najważniejsze szczegóły (etap, pole, powód). */
export function opisZdarzenia(akcja: string, szczegoly: unknown): string {
  const nazwa = ZDARZENIA[akcja] ?? akcja;
  const d = szczegoly && typeof szczegoly === "object" ? (szczegoly as Record<string, unknown>) : {};
  if (akcja === "MIGRATION_STAGE_CHANGED") {
    const powod = typeof d.powod === "string" ? ` — ${d.powod}` : "";
    return `${nazwa}: ${nazwaEtapu(String(d.z))} → ${nazwaEtapu(String(d.na))}${powod}`;
  }
  if (akcja === "MIGRATION_CHECKLIST_UPDATED" && typeof d.pole === "string") {
    return `${nazwa}: ${POLA[d.pole] ?? d.pole} ${d.odhaczone ? "✓" : "— wyczyszczone"}`;
  }
  if (akcja === "MIGRATION_HANDLING_UPDATED" && d.zmiany && typeof d.zmiany === "object") {
    return `${nazwa}: ${Object.keys(d.zmiany as object).map((k) => POLA[k] ?? k).join(", ")}`;
  }
  if (akcja === "MIGRATION_REPORT_SENT" && d.ponownie) return `${nazwa} (ponownie)`;
  return nazwa;
}

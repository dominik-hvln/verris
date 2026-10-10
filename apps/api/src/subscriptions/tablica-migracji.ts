/**
 * D11 (10.10) — tablica migracji dla obsługi, wzorzec procesu z kolejki migracji właściciela (Jira, 133 zgłoszenia):
 * etapy, twarde terminy, checklisty jako warunek przejścia dalej, raport pomigracyjny i log kontaktów.
 * Reguły bez Nesta i bazy (testowane wprost w tablica-migracji.spec.ts).
 *
 * Etap obsługi to osobne pole (`MigrationRequest.etapObslugi`) — automat migratora dalej prowadzi `status`
 * (QUEUED → RUNNING → COMPLETED / ATTENTION / FAILED) i nie wie o tablicy. Tablica czyta jego stan jako warunek:
 * do testów i do zmiany DNS wchodzi tylko zlecenie, którego dane automat już przeniósł (COMPLETED), a „Po przełączeniu”
 * wymaga potwierdzonego przełączenia DNS (`cutoverAt` — to samo sprawdzenie co „Sprawdź DNS” klienta).
 */

export const ETAPY = ['NOWA', 'TESTY', 'DO_ZMIANY_DNS', 'PO_PRZELACZENIU', 'ZAMKNIETA'] as const;
export type Etap = (typeof ETAPY)[number];

export const ETAP_PL: Record<Etap, string> = {
  NOWA: 'Nowa',
  TESTY: 'Testy u nas',
  DO_ZMIANY_DNS: 'Do zmiany DNS',
  PO_PRZELACZENIU: 'Po przełączeniu',
  ZAMKNIETA: 'Zamknięta',
};

/** SLA migracji: termin domyślny = utworzenie + 3 dni (Jira: „termin = utworzenie + 3 dni”). */
export const SLA_DNI = 3;
/** Okno poprawek po przełączeniu DNS — domyślnie 7 dni (mediana życia zgłoszenia w Jirze), operator może zmienić. */
export const OKNO_POPRAWEK_DNI = 7;
export const OKNO_POPRAWEK_MAX_DNI = 30;
/** Powód cofnięcia etapu (dziennik) — jak przy akcjach operatora (D2). */
export const MIN_POWOD = 10;

const DZIEN_MS = 24 * 60 * 60 * 1000;
const GODZ_MS = 60 * 60 * 1000;

/** Pozycje checklisty: tekstowe (wynik, opis) i znacznik TTL 300. */
export const POLA_CHECKLISTY = ['ttl300', 'testTymczasowy', 'testPrzed', 'testPo', 'optymalizacja', 'podsumowanie'] as const;
export type PoleChecklisty = (typeof POLA_CHECKLISTY)[number];

export const POLE_PL: Record<PoleChecklisty, string> = {
  ttl300: 'TTL domen zmienione na 300',
  testTymczasowy: 'Wynik testu strony na tymczasowym adresie',
  testPrzed: 'Test wydajności przed (stary hosting)',
  testPo: 'Test wydajności po (Verris)',
  optymalizacja: 'Optymalizacja przeprowadzona',
  podsumowanie: 'Podsumowanie dla klienta',
};

export interface WpisChecklisty {
  /** Wynik testu, opis optymalizacji, treść podsumowania; dla ttl300 — brak. */
  tekst?: string;
  at: string;
  przez: string;
}
export type Checklista = Partial<Record<PoleChecklisty, WpisChecklisty>>;

/** Odczyt JSON-a z bazy — nieznane klucze i śmieci odpadają. */
export function checklistaZBazy(v: unknown): Checklista {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Checklista = {};
  for (const k of POLA_CHECKLISTY) {
    const w = (v as Record<string, unknown>)[k];
    if (!w || typeof w !== 'object') continue;
    const o = w as Record<string, unknown>;
    if (typeof o.at !== 'string' || typeof o.przez !== 'string') continue;
    out[k] = { at: o.at, przez: o.przez, ...(typeof o.tekst === 'string' ? { tekst: o.tekst } : {}) };
  }
  return out;
}

export interface StanMigracji {
  etap: Etap;
  /** Status automatu (MigrationStatus). */
  status: string;
  createdAt: Date;
  cutoverAt: Date | null;
  termin: Date | null;
  wygasaUStaregoAt: Date | null;
  domenaWygasaAt: Date | null;
  poprawkiDo: Date | null;
  raportWyslanyAt: Date | null;
  checklista: Checklista;
}

const wymagane = (c: Checklista, pola: PoleChecklisty[]) => pola.filter((p) => !c[p]).map((p) => POLE_PL[p]);

/** Co musi być w raporcie pomigracyjnym (podsumowanie, optymalizacja, test przed/po). */
export const POLA_RAPORTU: PoleChecklisty[] = ['podsumowanie', 'optymalizacja', 'testPrzed', 'testPo'];

/** Czego brakuje do wysłania raportu: etap „Po przełączeniu” i komplet pól raportu. */
export function brakiRaportu(m: StanMigracji): string[] {
  const braki: string[] = [];
  if (m.etap !== 'PO_PRZELACZENIU') braki.push(`Raport wysyłamy na etapie „${ETAP_PL.PO_PRZELACZENIU}”`);
  return [...braki, ...wymagane(m.checklista, POLA_RAPORTU)];
}

/**
 * Warunki wejścia na etap (checklisty z Jiry jako pola wymagane). Pusta lista — można przejść.
 * Dotyczy tylko ruchu naprzód; cofnięcie wymaga powodu (przejscie()).
 */
export function brakiDoEtapu(m: StanMigracji, cel: Etap): string[] {
  const automat =
    m.status === 'COMPLETED' ? [] : [`Automat nie skończył przenoszenia danych (stan: ${STATUS_PL[m.status] ?? m.status})`];
  switch (cel) {
    case 'NOWA':
      return [];
    case 'TESTY':
      return automat;
    case 'DO_ZMIANY_DNS':
      // Checklista „potwierdzanie” (przed przełączeniem DNS).
      return [...automat, ...wymagane(m.checklista, ['ttl300', 'testTymczasowy'])];
    case 'PO_PRZELACZENIU':
      return m.cutoverAt ? [] : ['DNS nie wskazuje jeszcze na nas — użyj „Sprawdź DNS”'];
    case 'ZAMKNIETA':
      // Checklista „zamykanie”: podsumowanie, optymalizacja, raport z testem przed/po — wszystko wychodzi raportem.
      return m.raportWyslanyAt ? wymagane(m.checklista, POLA_RAPORTU) : ['Raport pomigracyjny nie został wysłany klientowi'];
  }
}

export const STATUS_PL: Record<string, string> = {
  DRAFT: 'czeka na zgodę klienta',
  QUEUED: 'w kolejce',
  RUNNING: 'w toku',
  ATTENTION: 'wymaga uwagi',
  COMPLETED: 'ukończona',
  FAILED: 'nieudana',
  CANCELED: 'anulowana',
};

export type WynikPrzejscia = { ok: true; kierunek: 'naprzod' | 'wstecz' } | { ok: false; bledy: string[] };

/**
 * Przejście etapu: naprzód tylko o jeden etap i po spełnieniu warunków; wstecz o dowolną liczbę etapów z powodem
 * (np. klient zgłosił błąd po przełączeniu — wraca do testów). Anulowanej migracji nie prowadzimy dalej.
 */
export function przejscie(m: StanMigracji, cel: Etap, powod?: string | null): WynikPrzejscia {
  const z = ETAPY.indexOf(m.etap);
  const na = ETAPY.indexOf(cel);
  if (na < 0) return { ok: false, bledy: ['Nieznany etap'] };
  if (na === z) return { ok: false, bledy: [`Migracja jest już na etapie „${ETAP_PL[cel]}”`] };
  if (na < z) {
    if ((powod ?? '').trim().length < MIN_POWOD) return { ok: false, bledy: [`Podaj powód cofnięcia (min. ${MIN_POWOD} znaków)`] };
    return { ok: true, kierunek: 'wstecz' };
  }
  if (m.status === 'CANCELED') return { ok: false, bledy: ['Migracja jest anulowana'] };
  if (na !== z + 1) return { ok: false, bledy: [`Najpierw „${ETAP_PL[ETAPY[z + 1]!]}” — etapów nie przeskakujemy`] };
  const braki = brakiDoEtapu(m, cel);
  return braki.length ? { ok: false, bledy: braki } : { ok: true, kierunek: 'naprzod' };
}

/** Termin domyślny, gdy operator nie ustawił własnego. */
export const terminDomyslny = (createdAt: Date) => new Date(createdAt.getTime() + SLA_DNI * DZIEN_MS);

export type RodzajTerminu = 'sla' | 'stary-hosting' | 'domena' | 'okno-poprawek';

export const TERMIN_PL: Record<RodzajTerminu, string> = {
  sla: 'termin migracji',
  'stary-hosting': 'hosting u starego dostawcy wygasa',
  domena: 'domena wygasa',
  'okno-poprawek': 'koniec okna poprawek',
};

/**
 * Jak wcześnie ostrzegać: termin wewnętrzny i okno poprawek — dobę przed; wygaśnięcie u starego dostawcy i domeny
 * — 3 doby przed (przełączenie DNS przy TTL 300 i ewentualne odnowienie potrzebują zapasu).
 */
export const PROG_ALERTU_MS: Record<RodzajTerminu, number> = {
  sla: 24 * GODZ_MS,
  'okno-poprawek': 24 * GODZ_MS,
  'stary-hosting': 3 * DZIEN_MS,
  domena: 3 * DZIEN_MS,
};

export type StanTerminu = 'ok' | 'blisko' | 'po-terminie';

export interface Termin {
  rodzaj: RodzajTerminu;
  data: Date;
  stan: StanTerminu;
}

/**
 * Najbliższy twardy termin dla etapu. Do przełączenia DNS: termin migracji, wygaśnięcie hostingu u starego dostawcy
 * i domeny (wygrywa najwcześniejszy alert). Po przełączeniu: koniec okna poprawek. Zamknięta — brak terminu.
 */
export function terminMigracji(m: StanMigracji, teraz: Date): Termin | null {
  if (m.etap === 'ZAMKNIETA' || m.status === 'CANCELED') return null;
  const kandydaci: Array<{ rodzaj: RodzajTerminu; data: Date }> = [];
  if (m.etap === 'PO_PRZELACZENIU') {
    if (m.poprawkiDo) kandydaci.push({ rodzaj: 'okno-poprawek', data: m.poprawkiDo });
  } else {
    kandydaci.push({ rodzaj: 'sla', data: m.termin ?? terminDomyslny(m.createdAt) });
    if (m.wygasaUStaregoAt) kandydaci.push({ rodzaj: 'stary-hosting', data: m.wygasaUStaregoAt });
    if (m.domenaWygasaAt) kandydaci.push({ rodzaj: 'domena', data: m.domenaWygasaAt });
  }
  if (!kandydaci.length) return null;
  const stan = (k: { rodzaj: RodzajTerminu; data: Date }): StanTerminu =>
    k.data.getTime() <= teraz.getTime() ? 'po-terminie' : k.data.getTime() - teraz.getTime() <= PROG_ALERTU_MS[k.rodzaj] ? 'blisko' : 'ok';
  const waga: Record<StanTerminu, number> = { 'po-terminie': 0, blisko: 1, ok: 2 };
  // Najpilniejszy: najpierw stan (po terminie > blisko > ok), potem data alertu (data − próg).
  const [pierwszy] = kandydaci
    .map((k) => ({ ...k, stan: stan(k) }))
    .sort((a, b) => waga[a.stan] - waga[b.stan] || a.data.getTime() - PROG_ALERTU_MS[a.rodzaj] - (b.data.getTime() - PROG_ALERTU_MS[b.rodzaj]));
  return pierwszy!;
}

/** Klucz alertu: ten sam termin w tym samym stanie powiadamia raz („blisko” i „po terminie” — osobno). */
export const kluczAlertu = (t: Termin) => `${t.rodzaj}:${t.data.toISOString()}:${t.stan}`;

/** Kolejność na tablicy: Przerywacz na górze, potem najpilniejszy termin. */
export function kolejnosc(
  a: { przerywacz: boolean; termin: Termin | null },
  b: { przerywacz: boolean; termin: Termin | null },
): number {
  if (a.przerywacz !== b.przerywacz) return a.przerywacz ? -1 : 1;
  const t = (x: { termin: Termin | null }) => (x.termin ? x.termin.data.getTime() - PROG_ALERTU_MS[x.termin.rodzaj] : Number.MAX_SAFE_INTEGER);
  return t(a) - t(b);
}

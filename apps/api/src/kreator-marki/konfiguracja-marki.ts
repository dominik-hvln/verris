/**
 * Kreator marki (paczka 130) – konfiguracja modułu w ustawieniach platformy: JSON pod KLUCZ_KONFIGURACJI_MARKI w tabeli
 * PlatformSetting, ten sam mechanizm co Kreator stron (`kreator.konfiguracja`, apps/api/src/kreator/konfiguracja.ts) –
 * bez nowej migracji. Edycja: admin → GET/PUT /admin/kreator-marki/konfiguracja (Admin → Wiedza i AI → Kreator marki).
 *
 * Decyzja właściciela 19.11.2026: pełny zakres od razu, ale moduł domyślnie WYŁĄCZONY do publikacji dokumentów
 * prawnych (projekt: docs/legal/drafts/DO_ZATWIERDZENIA_kreator-marki.md). Ceny i limity są tu, nie w kodzie
 * ekranów – verris.pl czyta je z GET /public/oferta/kreator-marki (zasada z 1.11.2026: ceny z danych panelu).
 *
 * Ceny przechowujemy BRUTTO (jak Plan.priceMonthly); netto liczymy zawsze z brutto (brutto / 1,23, do grosza –
 * rozbicieVat, ta sama funkcja co na fakturze), więc nie da się zapisać rozjechanej pary.
 */
import { Prisma } from '@verris/database';
import { rozbicieVat } from '../billing/faktura-za-portfel.js';

export const KLUCZ_KONFIGURACJI_MARKI = 'kreator-marki.konfiguracja';

/** Funkcja w AiInteractionLog dla kreatora marki (faza 2 – koszt w raporcie AI i w budżecie platformy). */
export const FUNKCJA_AI_MARKI = 'kreator-marki';

/**
 * Kto ma moduł, gdy jest włączony:
 * - `lista` – tylko konta z `kontaTestowe` (jak Kreator stron przed włączeniem dla wszystkich),
 * - `beta` – konta z listy + testerzy z zaproszenia (zrealizowany kod BETA, BetaService.czyTester),
 * - `wszyscy` – każde konto z hostingiem; tylko wtedy strona /kreator-marki na verris.pl istnieje.
 * Konta z listy mają dostęp zawsze, także przy wyłączonym module (testy przed startem).
 */
export const DOSTEPNOSCI_MARKI = ['lista', 'beta', 'wszyscy'] as const;
export type DostepnoscMarki = (typeof DOSTEPNOSCI_MARKI)[number];

export type LimityMarki = {
  /** Marki na koncie. */
  marek: number;
  /** Serie propozycji (6 kierunków) w miesiącu. */
  seriiMies: number;
  /** Zmiany AI (hasło, opis, nazwa koloru…) w miesiącu. Zmiana koloru, kroju i układu nie liczy się – działa bez AI. */
  zmianAiMies: number;
};

export type PakietMarki = {
  /** Cena jednorazowa brutto, zł. Netto: cenyMarki(). */
  cenaBrutto: number;
  /** Serie propozycji w Pakiecie (łącznie, nie miesięcznie). */
  serie: number;
  /** Zmiany AI w Pakiecie (łącznie). */
  zmianyAi: number;
  /** Ile miesięcy od zakupu klient dostaje nowe szablony materiałów. */
  aktualizacjeSzablonowMies: number;
};

export type KonfiguracjaMarki = {
  wlaczony: boolean;
  dostepnosc: DostepnoscMarki;
  /** E-maile (małe litery) albo identyfikatory kont z dostępem niezależnie od włącznika. */
  kontaTestowe: string[];
  /** Limity w cenie hostingu. */
  wCenieHostingu: LimityMarki;
  pakiet: PakietMarki;
  /** Druga i kolejna marka na koncie – cena jednorazowa brutto, zł. */
  drugaMarka: { cenaBrutto: number };
  /** Czy Kreator Pro opłacany rocznie zawiera Pakiet marki (założenie 19.11: nie – do decyzji właściciela). */
  pakietWKreatorzeProRocznym: boolean;
  /** Symbole od AI (swobodny SVG po walidatorze) obok sygnetów z biblioteki. */
  symboleAi: boolean;
  /** Model serii propozycji (kierunki marki). Tylko Anthropic – jak Kreator stron (cache promptu w formacie Anthropic). */
  modelGeneracji: string;
  /** Model drobnych zmian AI. */
  modelZmian: string;
  /** Maksymalny rozmiar wgranego logo (ścieżki „Mam logo” i „Odświeżenie”), MB. */
  maksRozmiarWgraniaMb: number;
};

/** Zakresy pól liczbowych – te same w DTO admina i w odczycie z bazy. */
export const ZAKRESY_MARKI = {
  marek: { min: 0, max: 20 },
  seriiMies: { min: 0, max: 100 },
  zmianAiMies: { min: 0, max: 10_000 },
  serie: { min: 0, max: 500 },
  zmianyAi: { min: 0, max: 20_000 },
  aktualizacjeSzablonowMies: { min: 0, max: 60 },
  cenaBrutto: { min: 0, max: 10_000 },
  maksRozmiarWgraniaMb: { min: 1, max: 25 },
} as const;

export const DOMYSLNA_KONFIGURACJA_MARKI: KonfiguracjaMarki = {
  wlaczony: false,
  dostepnosc: 'lista',
  kontaTestowe: [],
  wCenieHostingu: { marek: 1, seriiMies: 3, zmianAiMies: 50 },
  pakiet: { cenaBrutto: 149, serie: 10, zmianyAi: 300, aktualizacjeSzablonowMies: 12 },
  drugaMarka: { cenaBrutto: 49 },
  pakietWKreatorzeProRocznym: false,
  symboleAi: true,
  modelGeneracji: 'claude-sonnet-5-5',
  modelZmian: 'claude-sonnet-5-5',
  maksRozmiarWgraniaMb: 10,
};

/** Tylko modele Anthropic (prefiks claude-) – ten sam wzorzec co MODEL_KREATORA_RE. */
export const MODEL_MARKI_RE = /^claude-[A-Za-z0-9._:-]{2,76}$/;
const MAKS_KONT_TESTOWYCH = 200;

const obiekt = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Liczba całkowita w zakresie; inaczej wartość domyślna (śmieci w bazie nie zmieniają limitów). */
function calkowita(v: unknown, zakres: { min: number; max: number }, dom: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= zakres.min && v <= zakres.max ? v : dom;
}

/** Kwota brutto w zakresie, zaokrąglona do grosza; inaczej domyślna. */
function kwota(v: unknown, dom: number): number {
  const z = ZAKRESY_MARKI.cenaBrutto;
  return typeof v === 'number' && Number.isFinite(v) && v >= z.min && v <= z.max ? Math.round(v * 100) / 100 : dom;
}

/** Ustawienie z bazy (JSON) → pełna, bezpieczna konfiguracja; brakujące albo złe pola = wartości domyślne. */
export function odczytajKonfiguracjeMarki(surowe: string | null | undefined): KonfiguracjaMarki {
  let v: Record<string, unknown>;
  try {
    v = obiekt(surowe ? JSON.parse(surowe) : {});
  } catch {
    v = {};
  }
  const d = DOMYSLNA_KONFIGURACJA_MARKI;
  const z = ZAKRESY_MARKI;
  const model = (x: unknown, dom: string) => (typeof x === 'string' && MODEL_MARKI_RE.test(x) ? x : dom);
  const h = obiekt(v.wCenieHostingu);
  const p = obiekt(v.pakiet);
  const konta = Array.isArray(v.kontaTestowe)
    ? [
        ...new Set(
          v.kontaTestowe
            .filter((k): k is string => typeof k === 'string')
            .map((k) => k.trim().toLowerCase())
            .filter((k) => k.length > 0 && k.length <= 120),
        ),
      ].slice(0, MAKS_KONT_TESTOWYCH)
    : [];
  return {
    wlaczony: v.wlaczony === true,
    dostepnosc: (DOSTEPNOSCI_MARKI as readonly unknown[]).includes(v.dostepnosc) ? (v.dostepnosc as DostepnoscMarki) : d.dostepnosc,
    kontaTestowe: konta,
    wCenieHostingu: {
      marek: calkowita(h.marek, z.marek, d.wCenieHostingu.marek),
      seriiMies: calkowita(h.seriiMies, z.seriiMies, d.wCenieHostingu.seriiMies),
      zmianAiMies: calkowita(h.zmianAiMies, z.zmianAiMies, d.wCenieHostingu.zmianAiMies),
    },
    pakiet: {
      cenaBrutto: kwota(p.cenaBrutto, d.pakiet.cenaBrutto),
      serie: calkowita(p.serie, z.serie, d.pakiet.serie),
      zmianyAi: calkowita(p.zmianyAi, z.zmianyAi, d.pakiet.zmianyAi),
      aktualizacjeSzablonowMies: calkowita(p.aktualizacjeSzablonowMies, z.aktualizacjeSzablonowMies, d.pakiet.aktualizacjeSzablonowMies),
    },
    drugaMarka: { cenaBrutto: kwota(obiekt(v.drugaMarka).cenaBrutto, d.drugaMarka.cenaBrutto) },
    pakietWKreatorzeProRocznym: v.pakietWKreatorzeProRocznym === true,
    symboleAi: typeof v.symboleAi === 'boolean' ? v.symboleAi : d.symboleAi,
    modelGeneracji: model(v.modelGeneracji, d.modelGeneracji),
    modelZmian: model(v.modelZmian, d.modelZmian),
    maksRozmiarWgraniaMb: calkowita(v.maksRozmiarWgraniaMb, z.maksRozmiarWgraniaMb, d.maksRozmiarWgraniaMb),
  };
}

/**
 * Scalenie zmian admina z obecną konfiguracją: obiekty zagnieżdżone (limity, pakiet, druga marka) polami – zmiana
 * samej ceny Pakietu nie zeruje jego limitów. Wynik przechodzi przez tę samą walidację co odczyt z bazy.
 */
export function scalKonfiguracjeMarki(obecna: KonfiguracjaMarki, zmiany: Partial<Record<keyof KonfiguracjaMarki, unknown>>): KonfiguracjaMarki {
  const bezUndefined = (o: unknown) => Object.fromEntries(Object.entries(obiekt(o)).filter(([, x]) => x !== undefined));
  const plaskie = bezUndefined(zmiany);
  return odczytajKonfiguracjeMarki(
    JSON.stringify({
      ...obecna,
      ...plaskie,
      wCenieHostingu: { ...obecna.wCenieHostingu, ...bezUndefined(zmiany.wCenieHostingu) },
      pakiet: { ...obecna.pakiet, ...bezUndefined(zmiany.pakiet) },
      drugaMarka: { ...obecna.drugaMarka, ...bezUndefined(zmiany.drugaMarka) },
    }),
  );
}

export interface CenaBruttoNetto {
  brutto: number;
  netto: number;
}

/** Kwota brutto → para brutto/netto (netto = brutto / 1,23 do grosza, jak na fakturze – rozbicieVat). */
export function bruttoNetto(brutto: number): CenaBruttoNetto {
  const v = rozbicieVat(new Prisma.Decimal(brutto));
  return { brutto: Number(v.brutto.toFixed(2)), netto: Number(v.netto.toFixed(2)) };
}

export function cenyMarki(konf: KonfiguracjaMarki): { pakiet: CenaBruttoNetto; drugaMarka: CenaBruttoNetto } {
  return { pakiet: bruttoNetto(konf.pakiet.cenaBrutto), drugaMarka: bruttoNetto(konf.drugaMarka.cenaBrutto) };
}

/** Czy konto jest na liście testowej (po e-mailu albo identyfikatorze konta). */
export function kontoTestoweMarki(konf: KonfiguracjaMarki, konto: { id: string; email?: string | null }): boolean {
  return konf.kontaTestowe.includes(konto.id.toLowerCase()) || (!!konto.email && konf.kontaTestowe.includes(konto.email.toLowerCase()));
}

/**
 * Czy konto ma Kreator marki (bez warunku hostingu – ten sprawdza faza 2 tak jak Kreator stron, wersjaKreatora).
 * `tester` – zrealizowane zaproszenie do testów (BetaService.czyTester).
 */
export function dostepDoMarki(konf: KonfiguracjaMarki, konto: { id: string; email?: string | null; tester?: boolean }): boolean {
  if (kontoTestoweMarki(konf, konto)) return true;
  if (!konf.wlaczony) return false;
  if (konf.dostepnosc === 'wszyscy') return true;
  if (konf.dostepnosc === 'beta') return konto.tester === true;
  return false;
}

/** Moduł publicznie w ofercie (strona /kreator-marki na verris.pl, cennik, sitemap): włączony dla wszystkich. */
export function markaPublicznie(konf: KonfiguracjaMarki): boolean {
  return konf.wlaczony && konf.dostepnosc === 'wszyscy';
}

export type OfertaMarki =
  | { dostepny: false }
  | {
      dostepny: true;
      wCenieHostingu: LimityMarki;
      pakiet: CenaBruttoNetto & Omit<PakietMarki, 'cenaBrutto'>;
      drugaMarka: CenaBruttoNetto;
      pakietWKreatorzeProRocznym: boolean;
      symboleAi: boolean;
      maksRozmiarWgraniaMb: number;
    };

/**
 * GET /public/oferta/kreator-marki – to, co verris.pl może pokazać. Przy module niepublicznym tylko `dostepny: false`
 * (bez cen i limitów – strona i tak nie istnieje, a dane przed startem nie wyciekają).
 */
export function ofertaMarki(konf: KonfiguracjaMarki): OfertaMarki {
  if (!markaPublicznie(konf)) return { dostepny: false };
  const ceny = cenyMarki(konf);
  const p = konf.pakiet;
  return {
    dostepny: true,
    wCenieHostingu: { ...konf.wCenieHostingu },
    pakiet: { ...ceny.pakiet, serie: p.serie, zmianyAi: p.zmianyAi, aktualizacjeSzablonowMies: p.aktualizacjeSzablonowMies },
    drugaMarka: ceny.drugaMarka,
    pakietWKreatorzeProRocznym: konf.pakietWKreatorzeProRocznym,
    symboleAi: konf.symboleAi,
    maksRozmiarWgraniaMb: konf.maksRozmiarWgraniaMb,
  };
}

/**
 * Podsumowanie użycia w adminie. Faza 1 (paczka 130): tabel kreatora marki jeszcze nie ma – zera i `zrodlo:
 * 'brak-danych'`. Faza 2 podmienia tę funkcję na zapytania (marki, serie, zmiany AI, koszt z AiInteractionLog
 * z funkcją FUNKCJA_AI_MARKI, sprzedane Pakiety i drugie marki) – kształt odpowiedzi zostaje.
 */
export interface UzycieMarki {
  miesiac: string;
  zrodlo: 'brak-danych' | 'baza';
  marki: number;
  kontaZMarka: number;
  serie: number;
  zmianyAi: number;
  kosztUsd: number;
  pakiety: number;
  drugieMarki: number;
}

export function uzycieMarkiBezDanych(miesiac: string): UzycieMarki {
  return { miesiac, zrodlo: 'brak-danych', marki: 0, kontaZMarka: 0, serie: 0, zmianyAi: 0, kosztUsd: 0, pakiety: 0, drugieMarki: 0 };
}

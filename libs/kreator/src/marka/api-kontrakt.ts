/**
 * Kreator marki – kontrakt HTTP między API (apps/api/src/kreator-marki) a panelem klienta (faza 2, paczka 131).
 * Same typy (bez kodu). Ścieżki względem prefiksu API; wszystkie wymagają zalogowanego klienta z dostępem do modułu
 * (KonfiguracjaMarkiService) – inaczej 403 { kod: 'MODUL_NIEDOSTEPNY' }. Błędy: { message: string (po polsku), kod? }.
 *
 * GET    /kreator-marki/stan                                  → StanKreatoraMarki
 * POST   /kreator-marki/marki            NowaMarkaBody         → WidokMarki (szkic z briefem; limit marek)
 * GET    /kreator-marki/marki/:id                              → WidokMarki
 * PATCH  /kreator-marki/marki/:id/brief  BriefMarki            → WidokMarki
 * POST   /kreator-marki/marki/:id/serie                        → WidokMarki (nowa seria kierunków; AI, limit serii)
 * POST   /kreator-marki/marki/:id/odswiezenie                  → WidokMarki (3 kierunki odświeżenia; AI, limit serii)
 * POST   /kreator-marki/marki/:id/wybierz  WybierzBody         → WidokMarki (projekt zapisany, odcisk w rejestrze; 409 PODOBNY_ZNAK)
 * PUT    /kreator-marki/marki/:id/projekt  { projekt }         → WidokMarki (edycja „Dopasuj” bez AI; ocena reguł)
 * PUT    /kreator-marki/marki/:id/kv       UstawieniaKv        → WidokMarki
 * PUT    /kreator-marki/marki/:id/kontakt  DaneKontaktoweMarki → WidokMarki
 * POST   /kreator-marki/marki/:id/ai       DrobnaZmianaBody    → { wynik: Record<string, string>; widok: WidokMarki } (limit zmian AI)
 * POST   /kreator-marki/marki/:id/kv-ai    { polecenie? }      → WidokMarki (propozycja KV pod wgrane logo; AI)
 * POST   /kreator-marki/marki/:id/zgody    ZgodyBody           → WidokMarki
 * POST   /kreator-marki/wgraj   multipart: plik, zrodlo ('wgrane'|'odswiezenie'), oswiadczenie='tak', nazwa?, branza?
 *                                                              → WidokMarki (z `analiza`)
 * GET    /kreator-marki/napis?font=&waga=&tekst=&rozstrzelenie= → KsztaltNapisu (krzywe do podglądu na żywo; cache)
 * GET    /kreator-marki/marki/:id/logo.svg?uklad=&wariant=     → image/svg+xml (napis na krzywych)
 * GET    /kreator-marki/marki/:id/material/:material.(svg|png) → podgląd materiału KV (MaterialKv)
 * GET    /kreator-marki/marki/:id/pliki                        → PlikMarki[] (lista z dostępnością wg wersji)
 * GET    /kreator-marki/marki/:id/pliki/:plik                  → plik (SVG/PNG/PDF/ICO/HTML/ZIP); 402 PAKIET_WYMAGANY,
 *                                                                 409 TMVIEW_WYMAGANY (pliki do druku), 402 PROBA (okres próbny)
 * GET    /kreator-marki/marki/:id/eksport.zip                  → ZIP wszystkiego, co dostępne
 * POST   /kreator-marki/marki/:id/stopka-email                 → StopkaEmailWynik
 * DELETE /kreator-marki/marki/:id                              → 204
 * POST   /kreator-marki/pakiet         ZakupPakietuBody        → WynikZakupuMarki
 * POST   /kreator-marki/druga-marka    ZakupPakietuBody        → WynikZakupuMarki
 *
 * Uzupełnienia z implementacji API (paczka 131, zgodne wstecz – bez zmian ścieżek i typów):
 * - błędy: `{ message, kod, bledy? }` (`bledy` – lista komunikatów walidacji/reguł). Kody: MODUL_NIEDOSTEPNY,
 *   BRAK_HOSTINGU (403); NIE_MA_MARKI, NIE_MA_KIERUNKU, NIE_MA_PLIKU (404); NIEPOPRAWNE_DANE, ZLE_ZRODLO,
 *   ZNAK_SPOZA_KIERUNKU, KROJ_SPOZA_KATALOGU, BRAK_OSWIADCZENIA, BRAK_ZGODY (400); LIMIT_MAREK, LIMIT_SERII,
 *   LIMIT_ZMIAN_AI, PAKIET_WYMAGANY, PROBA (402); PODOBNY_ZNAK, TMVIEW_WYMAGANY, PAKIET_KUPIONY, ZAKUP_W_TOKU,
 *   BEZ_PROJEKTU (409); PLIK_ZA_DUZY (413); PDF_NIEOBSLUGIWANY, TYP_NIEOBSLUGIWANY (415); ZNANA_MARKA, OCENA,
 *   SVG_NIEPOPRAWNY, WEKTOR_NIEUDANY (422); AI_NIEDOSTEPNE, KROJ_NIEDOSTEPNY (503);
 * - POST /marki/:id/ai → `wynik`: 'haslo' | 'podpis' → { '1', '2', '3' } (propozycje – zapis wybranej przez PUT kv /
 *   PATCH brief), 'opis' | 'dlaczego' → { tekst } ('opis' zapisany przy marce), 'kolory' → { glowny, akcent, akcentJasny }
 *   (nazwy kolorów, zapisane przy marce);
 * - PUT /marki/:id/projekt: zmiana znaku przechodzi przez rejestr (409 PODOBNY_ZNAK jak przy wyborze); symbol AI / wgrany
 *   tylko spośród pokazanych w seriach tej marki;
 * - `WidokMarki.wersja` rośnie przy zmianie projektu (wybór, Dopasuj, KV od AI, brief po wyborze) – nie przy KV,
 *   kontakcie i zgodach (te nie zmieniają migawki marki na stronie);
 * - GET /marki/:id/material/… bez Pakietu dla materiałów Pakietu – podgląd ze znakiem wodnym (PNG ≤ 720 px);
 * - StopkaEmailWynik.instrukcje[].program = nazwa programu do pokazania (np. „Webmail Verris”);
 * - karta / Paynow: `przekierowanie` = doładowanie portfela kwotą zakupu z referencją zamówienia; zakup opłaca się
 *   z portfela od razu po zaksięgowaniu wpłaty (powiadomienie Paynow / sprawdzenie statusu po powrocie na
 *   /dashboard/billing?paynow=…, webhook Stripe). Panel po powrocie odświeża GET /stan.
 */
import type {
  BriefMarki, DaneKontaktoweMarki, KierunekMarki, Marka, MaterialKv, ProjektLogo, UstawieniaKv, ZrodloMarki,
} from './model.ts';

export type WersjaMarkiKonta = 'proba' | 'hosting' | 'pakiet';

export interface LicznikMarki {
  uzyte: number;
  limit: number;
}

export interface CenaMarki {
  brutto: number;
  netto: number;
}

export interface PozycjaListyMarek {
  id: string;
  nazwa: string;
  zrodlo: ZrodloMarki;
  /** Etap: brief → kierunki → projekt (wybrany) → gotowa (po zgodach/eksporcie). */
  etap: 'brief' | 'kierunki' | 'projekt';
  wersja: number;
  zaktualizowano: string;
  /** Logo poziome (SVG, napis jako <text>) do miniatury; null przed wyborem. */
  miniaturaSvg: string | null;
}

export interface StanKreatoraMarki {
  dostepny: boolean;
  wersja: WersjaMarkiKonta;
  /**
   * Limity: `marki` – stan konta (w cenie hostingu + kupione kolejne marki). `serie` i `zmianyAi` – limit MIESIĘCZNY
   * w cenie hostingu + łączna pula Pakietu (uzyte/limit to sumy obu). Licznik miesięczny jest kluczowany miesiącem
   * kalendarzowym UTC ('YYYY-MM', miesiacUtc w apps/api) – odnawia się 1. dnia miesiąca o 00:00 UTC, czyli o 01:00
   * (zima) albo 02:00 (lato) czasu polskiego; nie jest liczony w strefie Europe/Warsaw. Pula Pakietu się nie odnawia.
   */
  limity: { marki: LicznikMarki; serie: LicznikMarki; zmianyAi: LicznikMarki };
  pakiet: {
    kupiony: boolean;
    cena: CenaMarki;
    aktualizacjeDo: string | null;
    /**
     * Co daje Pakiet (z konfiguracji admina, nie z kodu): pula serii i zmian AI – ŁĄCZNA, nie miesięczna – oraz liczba
     * miesięcy aktualizacji szablonów. Opcjonalne (dodane w paczce 131).
     */
    zawiera?: { serie: number; zmianyAi: number; aktualizacjeMies: number };
  };
  drugaMarka: { cena: CenaMarki; dostepna: boolean };
  symboleAi: boolean;
  maksWgraniaMb: number;
  marki: PozycjaListyMarek[];
}

export interface NowaMarkaBody {
  zrodlo: 'nowa';
  brief: BriefMarki;
}

export interface SeriaMarki {
  id: string;
  rodzaj: 'nowa' | 'odswiezenie';
  utworzono: string;
  kierunki: (KierunekMarki & {
    /** Odświeżenie: ewolucja / odświeżenie / nowy kierunek z opisem. */
    odswiezenie?: { typ: 'ewolucja' | 'odswiezenie' | 'nowy'; coZostaje: string; coSieZmienia: string; rozpoznawalnosc: string };
    /** Ocena reguł jakości (reguly.ts) – ostrzeżenia do pokazania. */
    ostrzezenia: string[];
  })[];
  strategia?: { grupa?: string; cecha?: string; skojarzenie?: string };
}

export interface AnalizaWgranego {
  kolory: { hex: string; udzial: number }[];
  problemy: string[];
  elementy: string[];
  krojPodobny?: string;
  /** Wektor (ścieżki, kanały) do porównania „Oryginał / Wektor”. */
  wektorSvg?: string;
  zgodnosc?: number;
  /** Oryginał jako data URI PNG (podgląd). */
  oryginal: string;
}

export interface WidokMarki {
  id: string;
  zrodlo: ZrodloMarki;
  etap: PozycjaListyMarek['etap'];
  wersja: number;
  brief: BriefMarki;
  serie: SeriaMarki[];
  /** Pełna marka po wyborze kierunku (null wcześniej). */
  marka: Marka | null;
  ocena: { ok: boolean; bledy: string[]; ostrzezenia: string[] } | null;
  analiza?: AnalizaWgranego;
  pliki: PlikMarki[];
  /** Strony z Kreatora stron używające tej marki (do „zaktualizuj stronę”). */
  strony: { id: string; nazwa: string; wersjaNaStronie: number | null }[];
}

export interface WybierzBody {
  seriaId: string;
  kierunekId: string;
  /** Projekt po edycji w podglądzie (opcjonalny) – serwer waliduje i ocenia. */
  projekt?: ProjektLogo;
}

export interface DrobnaZmianaBody {
  rodzaj: 'haslo' | 'podpis' | 'opis' | 'dlaczego' | 'kolory';
  polecenie?: string;
}

export interface ZgodyBody {
  sprawdzilemTmview?: boolean;
  oswiadczeniePraw?: boolean;
}

export interface PlikMarki {
  /** np. logo-poziome-kolor.svg, logo-poziome-kolor.png, logo.pdf, favicon.ico, wizytowka.pdf, ksiega-znaku.pdf */
  plik: string;
  grupa: 'logo' | 'ikony' | 'kv' | 'druk' | 'kroje' | 'stopka';
  opis: string;
  dostepny: boolean;
  /** Powód blokady: wymaga Pakietu / zgody TMview / opłaconego hostingu. */
  blokada?: 'PAKIET_WYMAGANY' | 'TMVIEW_WYMAGANY' | 'PROBA';
  material?: MaterialKv;
}

export interface StopkaEmailWynik {
  html: string;
  tekst: string;
  instrukcje: { program: string; kroki: string[]; sprawdzone: boolean }[];
}

export interface ZakupPakietuBody {
  metoda: 'portfel' | 'karta' | 'paynow';
  /** Zgoda na rozpoczęcie dostarczania treści cyfrowej i przyjęcie do wiadomości utraty prawa odstąpienia. */
  zgodaTresciCyfrowej: true;
}

export type WynikZakupuMarki =
  | { status: 'oplacony'; stan: StanKreatoraMarki }
  | { status: 'przekierowanie'; url: string }
  | { status: 'brak-srodkow'; brakuje: number };

export type { DaneKontaktoweMarki, UstawieniaKv };

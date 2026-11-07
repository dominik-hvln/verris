import {
  CENA_KREATORA_PRO,
  type Efekt,
  type PlanKreatora,
  type Strona,
  type TypSekcji,
  type WariantSekcji,
  type WersjaKreatora,
} from '@verris/kreator/klient';
import { plForm } from './pl';

/**
 * Verris Kreator w panelu klienta – kształty odpowiedzi API (apps/api/src/kreator: kreator.service.ts `stan`,
 * `lista`, `widok`, `wersje` oraz kontrakt publikacji z paczki 120) i czyste pomocnicze funkcje widoków.
 * Moduł działa także w przeglądarce, więc z biblioteki bierze wyłącznie wejście `@verris/kreator/klient`.
 */

export type StatusStronyKreatora = 'SZKIC' | 'GENEROWANIE' | 'BLAD' | 'GOTOWA';
export type ZrodloWersjiKreatora = 'AI_GENERACJA' | 'AI_ZMIANA' | 'RECZNA' | 'PRZYWROCENIE';

/** GET /kreator/stan */
export interface StanKreatora {
  dostep: boolean;
  powod: string | null;
  wersja: WersjaKreatora | null;
  plan: PlanKreatora | null;
  zuzycie: { miesiac: string; generacje: number; zmiany: number; stron: number };
  korzysciPro: { id: string; nazwa: string; opis: string }[];
  cenaPro: { miesiacBrutto: number; miesiacNetto: number; rokBrutto: number; rokNetto: number };
  katalog: { warianty: Record<TypSekcji, WariantSekcji[]>; efekty: Efekt[]; sekcjePro: TypSekcji[] };
}

/** GET /kreator/strony – pozycja listy. Daty jako ISO (JSON). */
export interface PozycjaListyKreatora {
  id: string;
  nazwa: string;
  status: StatusStronyKreatora;
  bladOpis: string | null;
  branza: string | null;
  opublikowanaAt: string | null;
  domena: string | null;
  propozycji: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /kreator/strony/:id (i odpowiedź PUT, POST …/ai, …/propozycja/:n, …/przywroc). */
export interface WidokStronyKreatora {
  id: string;
  nazwa: string;
  status: StatusStronyKreatora;
  bladOpis: string | null;
  branza: string | null;
  /** null = strona w trakcie generowania albo z błędem. */
  model: Strona | null;
  /** Kreator Pro: pozostałe propozycje projektu (modele stron). */
  propozycje: unknown[];
  /** Co zmieni publikacja bez Kreatora Pro. */
  zmianyBezPro: string[];
  opublikowanaAt: string | null;
  domena: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /kreator/strony/:id/wersje */
export interface WersjaStronyKreatora {
  numer: number;
  zrodlo: ZrodloWersjiKreatora;
  opis: string | null;
  createdAt: string;
}

export type StanDomenyPublikacji = 'pusta' | 'zajeta' | 'kreator' | 'nieznany';

/** GET /kreator/strony/:id/publikacja (kontrakt paczki 120). */
export interface StanPublikacji {
  wersja: WersjaKreatora;
  mozliwa: boolean;
  powod?: string;
  domeny: { domena: string; subskrypcjaId: string; stan: StanDomenyPublikacji }[];
  opublikowana?: { adres: string; at: string; domena?: string };
  zmianyPlanu: string[];
  linkPodgladu?: { adres: string; wazneDo: string };
}

/** POST /kreator/strony/:id/publikuj */
export type WynikPublikacji =
  | { tryb: 'podglad'; adres: string; wazneDo: string }
  | { tryb: 'domena'; adres: string; pliki: number; ostrzezenia: string[]; kopia?: string };

/** Formularz „Nowa strona” → POST /kreator/strony { nazwa, brief }. */
export interface NowaStronaKreatora {
  nazwa: string;
  brief: {
    opis: string;
    typ: 'wizytowka' | 'landing' | 'sklep' | 'portfolio' | 'blog' | 'inna';
    firma?: Record<string, unknown>;
    ceny?: string;
    ton?: string;
    styl?: string;
  };
}

// ---------------------------------------------------------------------------
// Ceny i liczby
// ---------------------------------------------------------------------------

/** 9.9 → „9,90 zł”, 99 → „99 zł”. */
export function zl(kwota: number): string {
  const calkowita = Number.isInteger(kwota);
  return `${kwota.toLocaleString('pl-PL', { minimumFractionDigits: calkowita ? 0 : 2, maximumFractionDigits: 2 })} zł`;
}

/** Netto z brutto przy VAT 23%, do grosza. */
export function nettoZBrutto(brutto: number): number {
  return Math.round((brutto / 1.23) * 100) / 100;
}

/** „9,90 zł brutto/mies. (8,05 zł netto) albo 99 zł brutto/rok (80,49 zł netto)” – zawsze netto i brutto. */
export function opisCenyPro(c: StanKreatora['cenaPro'] = CENA_KREATORA_PRO): string {
  return `${zl(c.miesiacBrutto)} brutto/mies. (${zl(c.miesiacNetto)} netto) albo ${zl(c.rokBrutto)} brutto/rok (${zl(c.rokNetto)} netto)`;
}

export const ETYKIETY_WERSJI: Record<WersjaKreatora, string> = {
  proba: 'Okres próbny',
  hosting: 'W cenie hostingu',
  pro: 'Kreator Pro',
};

export const ETYKIETY_ZRODEL: Record<ZrodloWersjiKreatora, string> = {
  AI_GENERACJA: 'Wygenerowana przez AI',
  AI_ZMIANA: 'Zmiana AI',
  RECZNA: 'Zapis z edytora',
  PRZYWROCENIE: 'Przywrócenie',
};

export const stron = (n: number) => `${n} ${plForm(n, 'strona', 'strony', 'stron')}`;
export const podstron = (n: number) => `${n} ${plForm(n, 'podstrona', 'podstrony', 'podstron')}`;
export const generacji = (n: number) => `${n} ${plForm(n, 'generacja', 'generacje', 'generacji')}`;
export const zmianAi = (n: number) => `${n} ${plForm(n, 'zmiana AI', 'zmiany AI', 'zmian AI')}`;

/** Ile zostało w miesiącu (nigdy poniżej zera). */
export function pozostalo(limit: number, zuzyte: number): number {
  return Math.max(0, limit - zuzyte);
}

/**
 * Czy klient może zacząć nową stronę – i dlaczego nie. Te same reguły co POST /kreator/strony
 * (KreatorService.utworz): liczba stron konta i miesięczny limit generacji.
 */
export function blokadaNowejStrony(stan: Pick<StanKreatora, 'dostep' | 'powod' | 'plan' | 'wersja' | 'zuzycie'>): string | null {
  if (!stan.dostep || !stan.plan) return stan.powod ?? 'Kreator nie jest dostępny na tym koncie.';
  const { plan, zuzycie } = stan;
  if (zuzycie.stron >= plan.stron) {
    return `Masz już ${zuzycie.stron} ${plForm(zuzycie.stron, 'stronę', 'strony', 'stron')} – w tej wersji kreatora limit to ${stron(plan.stron)}. Usuń jedną z nich${stan.wersja === 'pro' ? '' : ' albo przejdź na Kreator Pro'}.`;
  }
  if (zuzycie.generacje >= plan.generacjiMies) {
    return `Wykorzystano miesięczny limit (${generacji(plan.generacjiMies)}). Odnowi się 1. dnia miesiąca – do tego czasu możesz zmieniać istniejące strony.`;
  }
  return null;
}

/** Czy można dodać kolejną podstronę (limit z planu; null = bez limitu). */
export function moznaDodacPodstrone(plan: Pick<PlanKreatora, 'podstron'> | null, liczba: number): boolean {
  return !plan || plan.podstron === null || liczba < plan.podstron;
}

/** Kolor akcentu i tła z modelu do miniatury na liście (bez modelu – spokojny kolor panelu). */
export function kolorMiniatury(model: Pick<Strona, 'motyw'> | null | undefined): { tlo: string; akcent: string; tekst: string } {
  const p = model?.motyw?.paleta;
  return p ? { tlo: p.tlo, akcent: p.akcent, tekst: p.tekst } : { tlo: '#eceee6', akcent: '#0f7a52', tekst: '#0c1a14' };
}

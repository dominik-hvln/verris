import { netto, zl, type Ceny } from './ceny';
import { plForm } from './pl';
import { PANEL, ZAMOW } from './site';

/**
 * Okres próbny na verris.pl (decyzja 1.11.2026). Włącza go admin, ustawiając planowi hostingu trialDays > 0
 * (panel admina → Plany); GET /plans zwraca trialDays, więc strona przełącza teksty sama, bez wdrożenia.
 * Do tego czasu przyciski mówią „Zamów hosting” i prowadzą do /zamow.
 */
export function okresProbny(ceny: Ceny): boolean {
  return ceny.hosting.trialDays > 0;
}

/** Start próby w panelu: formularz nowej usługi z blokiem okresu próbnego (client-panel …/services/new/trial-callout.tsx). */
export const PROBA_HREF = `${PANEL}/dashboard/services/new`;

export type CtaProby = { label: string; krotko: string; href: string; proba: boolean; dni: number };

/** Tekst i cel głównego przycisku: „Wypróbuj 14 dni za darmo” albo „Zamów hosting”. */
export function ctaProby(ceny: Ceny): CtaProby {
  const dni = ceny.hosting.trialDays;
  if (dni > 0) {
    return {
      label: `Wypróbuj ${dni} ${plForm(dni, 'dzień', 'dni', 'dni')} za darmo`,
      krotko: 'Wypróbuj',
      href: PROBA_HREF,
      proba: true,
      dni,
    };
  }
  return { label: 'Zamów hosting', krotko: 'Zamów', href: ZAMOW, proba: false, dni: 0 };
}

/** Zamówienie dowolnej usługi w panelu (formularz nowej usługi z wyborem planu). */
export const ZAMOW_W_PANELU = `${PANEL}/dashboard/services/new`;

/** Zamówienie samej poczty w panelu (formularz nowej usługi z typem „Poczta e-mail”). */
export const CEL_POCZTY = '/dashboard/services/new?type=email';

/**
 * P4-4 (beta 3.11): „Załóż firmową pocztę” z /poczta prowadzi na rejestrację z zachowanym celem, a nie na logowanie
 * i ogólne „Nowa usługa”. Panel: rejestracja zapamiętuje `next` do pierwszego logowania; zalogowany klient trafia
 * od razu do zamówienia poczty (middleware panelu, /register z `next`). Ścieżka sprawdzana w panelu (sciezkaPowrotu).
 */
export const ZAMOW_POCZTE = `${PANEL}/register?next=${encodeURIComponent(CEL_POCZTY)}`;

export type TrescPaska = { tytul: string; podpis: string; przycisk: string; href: string };

/** Pasek na telefonie dla stron hostingu: cena miesięczna, podpis o próbie albo cenie rocznej. */
export function pasekHostingu(ceny: Ceny): TrescPaska {
  const cta = ctaProby(ceny);
  return {
    tytul: `${zl(ceny.hosting.miesiecznie)} / mies.`,
    podpis: cta.proba
      ? `${cta.dni} ${plForm(cta.dni, 'dzień', 'dni', 'dni')} za darmo, bez karty`
      : `brutto · albo ${zl(ceny.hosting.rocznie)} / rok`,
    przycisk: cta.krotko,
    href: cta.href,
  };
}

/** Pasek na telefonie dla /poczta: cena samej poczty. */
export function pasekPoczty(ceny: Ceny): TrescPaska {
  return {
    tytul: `${zl(ceny.poczta.miesiecznie)} / mies.`,
    podpis: `brutto · ${zl(netto(ceny.poczta.miesiecznie))} netto · sama poczta`,
    przycisk: 'Załóż pocztę',
    href: ZAMOW_POCZTE,
  };
}

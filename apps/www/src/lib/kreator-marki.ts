import { netto, zl } from './ceny';
import { plForm } from './pl';

/**
 * Kreator marki na verris.pl (paczka 130). Limity i ceny NIE są tu wpisane: przychodzą z ustawień modułu w panelu
 * admina przez GET /public/oferta/kreator-marki (lib/kreator-marki-api.ts) – zasada z 1.11.2026 (ceny z danych
 * panelu, nie z kodu). Gdy moduł nie jest włączony dla wszystkich, API zwraca `{ dostepny: false }`, parser – null,
 * a strona /kreator-marki zwraca 404 i znika z sitemapy (ten sam efekt co flagi VPS i e-mail marketingu
 * w lib/oferta.ts, tylko sterowany z panelu admina zamiast zmiennej środowiskowej).
 *
 * Kwoty w API są BRUTTO; netto liczymy jak na całej stronie – lib/ceny (netto = brutto / 1,23, do grosza).
 */
export type OfertaMarki = {
  wCenieHostingu: { marek: number; seriiMies: number; zmianAiMies: number };
  /** Pakiet marki – jednorazowo, brutto. */
  pakiet: { brutto: number; serie: number; zmianyAi: number; aktualizacjeSzablonowMies: number };
  /** Druga i kolejna marka na koncie – jednorazowo, brutto. */
  drugaMarka: { brutto: number };
  pakietWKreatorzeProRocznym: boolean;
  symboleAi: boolean;
  maksRozmiarWgraniaMb: number;
};

/** Baza znaków towarowych urzędów UE i krajowych (w tym UPRP i EUIPO) [adres do weryfikacji przed publikacją]. */
export const TMVIEW = 'https://www.tmdn.org/tmview/';

/** Panel – karta Kreatora marki (wymaga logowania). Ścieżka panelu powstaje w fazie 2 [do potwierdzenia z panelem]. */
export const KREATOR_MARKI_W_PANELU = 'https://panel.verris.pl/dashboard/kreator-marki';

const obiekt = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const liczba = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const calkowita = (v: unknown): number | null => {
  const n = liczba(v);
  return n !== null && Number.isInteger(n) ? n : null;
};

/** Odpowiedź API → oferta; `dostepny: false`, brak pola albo zła wartość → null (strona się nie pokaże). */
export function parsujOferteMarki(dane: unknown): OfertaMarki | null {
  const d = obiekt(dane);
  if (!d || d.dostepny !== true) return null;
  const h = obiekt(d.wCenieHostingu);
  const p = obiekt(d.pakiet);
  const dm = obiekt(d.drugaMarka);
  if (!h || !p || !dm) return null;
  const pola = {
    marek: calkowita(h.marek),
    seriiMies: calkowita(h.seriiMies),
    zmianAiMies: calkowita(h.zmianAiMies),
    brutto: liczba(p.brutto),
    serie: calkowita(p.serie),
    zmianyAi: calkowita(p.zmianyAi),
    aktualizacje: calkowita(p.aktualizacjeSzablonowMies),
    druga: liczba(dm.brutto),
    mb: calkowita(d.maksRozmiarWgraniaMb),
  };
  if (Object.values(pola).some((v) => v === null)) return null;
  if (typeof d.pakietWKreatorzeProRocznym !== 'boolean' || typeof d.symboleAi !== 'boolean') return null;
  return {
    wCenieHostingu: { marek: pola.marek!, seriiMies: pola.seriiMies!, zmianAiMies: pola.zmianAiMies! },
    pakiet: { brutto: pola.brutto!, serie: pola.serie!, zmianyAi: pola.zmianyAi!, aktualizacjeSzablonowMies: pola.aktualizacje! },
    drugaMarka: { brutto: pola.druga! },
    pakietWKreatorzeProRocznym: d.pakietWKreatorzeProRocznym,
    symboleAi: d.symboleAi,
    maksRozmiarWgraniaMb: pola.mb!,
  };
}

/** „149 zł brutto (121,14 zł netto)” – zasada: brutto i netto obok siebie. */
export function cenaBruttoNetto(brutto: number): string {
  return `${zl(brutto)} brutto (${zl(netto(brutto))} netto)`;
}

/** Liczebniki do tekstów strony: „1 marka”, „3 serie propozycji”, „50 zmian AI”. */
export const ileMarek = (n: number) => `${n} ${plForm(n, 'marka', 'marki', 'marek')}`;
export const ileSerii = (n: number) => `${n} ${plForm(n, 'seria', 'serie', 'serii')} propozycji`;
export const ileZmianAi = (n: number) => `${n.toLocaleString('pl-PL')} ${plForm(n, 'zmiana', 'zmiany', 'zmian')} AI`;
export const ileMiesiecy = (n: number) => `${n} ${plForm(n, 'miesiąc', 'miesiące', 'miesięcy')}`;

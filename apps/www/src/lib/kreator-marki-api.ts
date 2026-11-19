import { parsujOferteMarki, type OfertaMarki } from './kreator-marki';
import { REWALIDACJA_CEN_S } from './ceny-api';

/**
 * Kreator marki z API: GET /public/oferta/kreator-marki – serwerowo, z cache danych Next jak ceny (lib/ceny-api.ts).
 * Inaczej niż ceny hostingu NIE ma wartości zapasowych: brak odpowiedzi, `dostepny: false` albo zła odpowiedź = null,
 * czyli strona /kreator-marki zwraca 404 (moduł nie może pojawić się na stronie bez decyzji w panelu admina).
 * Przy chwilowej awarii API Next serwuje ostatnią poprawną odpowiedź z cache.
 */
export async function pobierzOferteMarki(): Promise<OfertaMarki | null> {
  // Testy (jest) – bez ruchu sieciowego; strony testują podstawioną ofertę przez jest.mock tego modułu.
  if (process.env.NODE_ENV === 'test') return null;
  try {
    const res = await fetch(`${(process.env.API_URL || 'http://api:3000').replace(/\/$/, '')}/public/oferta/kreator-marki`, {
      next: { revalidate: REWALIDACJA_CEN_S, tags: ['ceny'] },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parsujOferteMarki(await res.json());
  } catch (err) {
    console.warn(`[kreator-marki] oferta niedostępna – strona ukryta (API: ${String(err)})`);
    return null;
  }
}

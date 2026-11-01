import { CENY_ZAPASOWE, zlozCeny, type Ceny } from './ceny';

/**
 * Pobiera ceny z API (GET /plans, GET /autoscaling/pricing) — serwerowo, z cache danych Next na 5 minut.
 * Zmiana cennika w adminie trafia na stronę najpóźniej po 5 minutach. Gdy rewalidacja się nie uda, Next serwuje
 * ostatnią poprawną odpowiedź z cache; gdy cache jest pusty (np. pierwszy start bez API) — CENY_ZAPASOWE.
 */
export const REWALIDACJA_CEN_S = 300;

function apiUrl(): string {
  return (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
}

async function pobierzJson(sciezka: string): Promise<unknown> {
  const res = await fetch(`${apiUrl()}${sciezka}`, {
    next: { revalidate: REWALIDACJA_CEN_S, tags: ['ceny'] },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`${sciezka}: HTTP ${res.status}`);
  return res.json();
}

export async function pobierzCeny(): Promise<Ceny> {
  // Testy (jest) renderują strony bez API — od razu wartości zapasowe, bez ruchu sieciowego.
  if (process.env.NODE_ENV === 'test') return CENY_ZAPASOWE;
  const [plany, stawki] = await Promise.allSettled([pobierzJson('/plans'), pobierzJson('/autoscaling/pricing')]);
  const ceny = zlozCeny(
    plany.status === 'fulfilled' ? plany.value : null,
    stawki.status === 'fulfilled' ? stawki.value : null,
  );
  if (ceny.zrodlo !== 'api') {
    const powody = [plany, stawki].filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason));
    console.warn(`[ceny] część cen z wartości zapasowych (API: ${powody.join('; ') || 'niepełna odpowiedź'})`);
  }
  return ceny;
}

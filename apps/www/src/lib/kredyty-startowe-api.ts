import { KREDYTY_STARTOWE_ZAPASOWE, parsujKredytyStartowe, type KredytyStartowe } from './kredyty-startowe';
import { REWALIDACJA_CEN_S } from './ceny-api';

/**
 * Kredyty na autoskalowanie przy pierwszym zakupie (decyzja 6.11.2026) z API: GET /public/oferta/kredyty-startowe —
 * serwerowo, z cache danych Next jak ceny (lib/ceny-api.ts). Brak odpowiedzi → KREDYTY_STARTOWE_ZAPASOWE.
 */
export async function pobierzKredytyStartowe(): Promise<KredytyStartowe> {
  if (process.env.NODE_ENV === 'test') return KREDYTY_STARTOWE_ZAPASOWE;
  try {
    const res = await fetch(`${(process.env.API_URL || 'http://api:3000').replace(/\/$/, '')}/public/oferta/kredyty-startowe`, {
      next: { revalidate: REWALIDACJA_CEN_S, tags: ['ceny'] },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const k = parsujKredytyStartowe(await res.json());
    if (k) return k;
    throw new Error('niepełna odpowiedź');
  } catch (err) {
    console.warn(`[kredyty-startowe] wartości zapasowe (API: ${String(err)})`);
    return KREDYTY_STARTOWE_ZAPASOWE;
  }
}

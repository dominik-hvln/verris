import { plForm } from './pl';

/**
 * Decyzja Dominika 6.11.2026 — rabat startowy (procent za pierwszy okres) zastąpiony darmowymi kredytami na autoskalowanie przy pierwszym
 * zakupie hostingu. Kwoty z ustawień oferty w API (GET /public/oferta/kredyty-startowe, lib/kredyty-startowe-api.ts);
 * tu tylko teksty i parsowanie (plik czysty — mogą go używać komponenty klienckie).
 *
 * Zasady (apps/api/src/autoscaling/kredyty-autoskalowania.ts): tylko na dopłaty za autoskalowanie, ważne 12 miesięcy
 * od przyznania (po opłaceniu zamówienia), bez faktury i bez zwrotu. Cena pierwszego okresu = cena odnowienia, więc
 * strona nie pokazuje przekreślonych cen ani „najniższej ceny z 30 dni” (Omnibus dotyczy obniżek).
 */
export type KredytyStartowe = {
  wlaczone: boolean;
  /** Zł, plan roczny. */
  rocznie: number;
  /** Zł, plan miesięczny. */
  miesiecznie: number;
  waznoscMiesiecy: number;
};

/** Ostatnie znane ustawienia (6.11.2026) — tylko gdy API nie odpowiada, jak CENY_ZAPASOWE. */
export const KREDYTY_STARTOWE_ZAPASOWE: KredytyStartowe = { wlaczone: true, rocznie: 60, miesiecznie: 10, waznoscMiesiecy: 12 };

const kwota = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Odpowiedź API → kredyty; niepełna albo zła → null (wtedy wartości zapasowe). */
export function parsujKredytyStartowe(dane: unknown): KredytyStartowe | null {
  if (!dane || typeof dane !== 'object') return null;
  const d = dane as Record<string, unknown>;
  const r = kwota(d.rocznie);
  const m = kwota(d.miesiecznie);
  const w = kwota(d.waznoscMiesiecy);
  if (r === null || m === null || w === null || typeof d.wlaczone !== 'boolean') return null;
  return { wlaczone: d.wlaczone, rocznie: r, miesiecznie: m, waznoscMiesiecy: Math.max(1, Math.round(w)) };
}

/** „60 zł”, „12,50 zł”. */
function zlK(k: number): string {
  return Number.isInteger(k) ? `${k} zł` : `${k.toFixed(2).replace('.', ',')} zł`;
}

function waznosc(k: KredytyStartowe): string {
  return `${k.waznoscMiesiecy} ${plForm(k.waznoscMiesiecy, 'miesiąc', 'miesiące', 'miesięcy')}`;
}

/** Korzyść przy cenie: „+60 zł na autoskalowanie przy pierwszym zakupie (plan roczny), ważne 12 miesięcy”. null = brak. */
export function korzyscKredytow(k: KredytyStartowe, rocznie: boolean): string | null {
  const ile = rocznie ? k.rocznie : k.miesiecznie;
  if (!k.wlaczone || !(ile > 0)) return null;
  return `+${zlK(ile)} na autoskalowanie przy pierwszym zakupie (plan ${rocznie ? 'roczny' : 'miesięczny'}), ważne ${waznosc(k)}`;
}

/**
 * Zdanie do FAQ i notek przy cenniku. Bez kredytów (wyłączone w adminie) mówi tylko o cenie odnowienia.
 * „Przy pierwszym zakupie dostajesz darmowe kredyty na autoskalowanie: 60 zł przy planie rocznym albo 10 zł przy
 * miesięcznym, ważne 12 miesięcy — opłacą dodatkową moc w szczycie. Pierwszy okres kosztuje tyle co odnowienie.”
 */
export function kredytyNaStart(k: KredytyStartowe): string {
  const czesci: string[] = [];
  if (k.rocznie > 0) czesci.push(`${zlK(k.rocznie)} przy planie rocznym`);
  if (k.miesiecznie > 0) czesci.push(`${zlK(k.miesiecznie)} przy miesięcznym`);
  if (!k.wlaczone || czesci.length === 0) return 'Pierwszy okres kosztuje tyle co odnowienie – cena z cennika, bez promocji na start.';
  return `Przy pierwszym zakupie dostajesz darmowe kredyty na autoskalowanie: ${czesci.join(' albo ')}, ważne ${waznosc(k)} – opłacą dodatkową moc w szczycie. Pierwszy okres kosztuje tyle co odnowienie.`;
}

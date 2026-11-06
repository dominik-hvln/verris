/**
 * Decyzja 6.11.2026 — rabat na start zastąpiony kredytami na autoskalowanie przy pierwszym zakupie.
 * Kwoty z API (GET /public/oferta/kredyty-startowe), teksty z lib/kredyty-startowe.ts.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { CENY_ZAPASOWE } from './ceny';
import { korzyscKredytow, kredytyNaStart, KREDYTY_STARTOWE_ZAPASOWE, parsujKredytyStartowe } from './kredyty-startowe';
import { Pricing } from '@/app/(frontend)/components/Pricing';

const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('kredyty na start (www)', () => {
  it('parsuje odpowiedź API; zła albo niepełna → null (wtedy wartości zapasowe)', () => {
    expect(parsujKredytyStartowe({ wlaczone: true, rocznie: 60, miesiecznie: 10, waznoscMiesiecy: 12 })).toEqual(KREDYTY_STARTOWE_ZAPASOWE);
    expect(parsujKredytyStartowe({ wlaczone: true, rocznie: 60 })).toBeNull();
    expect(parsujKredytyStartowe(null)).toBeNull();
  });

  it('korzyść przy planie rocznym i miesięcznym; wyłączone albo 0 zł → brak', () => {
    expect(korzyscKredytow(KREDYTY_STARTOWE_ZAPASOWE, true)).toBe('+60 zł na autoskalowanie przy pierwszym zakupie (plan roczny), ważne 12 miesięcy');
    expect(korzyscKredytow(KREDYTY_STARTOWE_ZAPASOWE, false)).toBe('+10 zł na autoskalowanie przy pierwszym zakupie (plan miesięczny), ważne 12 miesięcy');
    expect(korzyscKredytow({ ...KREDYTY_STARTOWE_ZAPASOWE, wlaczone: false }, true)).toBeNull();
    expect(korzyscKredytow({ ...KREDYTY_STARTOWE_ZAPASOWE, miesiecznie: 0 }, false)).toBeNull();
  });

  it('zdanie do FAQ: kwoty z ustawień, bez rabatu; wyłączone → tylko cena odnowienia', () => {
    expect(kredytyNaStart({ wlaczone: true, rocznie: 80, miesiecznie: 15, waznoscMiesiecy: 12 })).toBe(
      'Przy pierwszym zakupie dostajesz darmowe kredyty na autoskalowanie: 80 zł przy planie rocznym albo 15 zł przy miesięcznym, ważne 12 miesięcy – opłacą dodatkową moc w szczycie. Pierwszy okres kosztuje tyle co odnowienie.',
    );
    expect(kredytyNaStart({ ...KREDYTY_STARTOWE_ZAPASOWE, wlaczone: false })).not.toMatch(/kredyt/);
  });

  it('cennik: przy cenie rocznej korzyść +60 zł, bez przekreślonej ceny i bez „najniższej ceny z 30 dni”', () => {
    const t = tekst(renderToStaticMarkup(<Pricing cena={CENY_ZAPASOWE.hosting} kredyty={KREDYTY_STARTOWE_ZAPASOWE} />));
    expect(t).toContain('+60 zł na autoskalowanie przy pierwszym zakupie (plan roczny), ważne 12 miesięcy');
    expect(t).toContain('Pierwszy okres kosztuje tyle co odnowienie');
    expect(t).not.toMatch(/rabat na start|najniższ|<s>|line-through/i);
  });
});

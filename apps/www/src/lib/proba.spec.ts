import { CENY_ZAPASOWE } from './ceny';
import { ctaProby, okresProbny, pasekHostingu, PROBA_HREF } from './proba';
import { ZAMOW } from './site';

const zProba = (dni: number) => ({ ...CENY_ZAPASOWE, hosting: { ...CENY_ZAPASOWE.hosting, trialDays: dni } });

describe('okres próbny na stronie', () => {
  it('bez próby w planie (trialDays 0): „Zamów hosting” do /zamow', () => {
    expect(okresProbny(CENY_ZAPASOWE)).toBe(false);
    expect(ctaProby(CENY_ZAPASOWE)).toMatchObject({ label: 'Zamów hosting', href: ZAMOW, proba: false });
  });

  it('próba włączona w adminie: liczba dni z API i link do panelu', () => {
    expect(ctaProby(zProba(14))).toMatchObject({ label: 'Wypróbuj 14 dni za darmo', href: PROBA_HREF, proba: true });
    expect(ctaProby(zProba(1)).label).toBe('Wypróbuj 1 dzień za darmo');
  });

  it('pasek na telefonie mówi o próbie tylko wtedy, gdy jest włączona', () => {
    expect(pasekHostingu(CENY_ZAPASOWE).podpis).toBe('brutto · albo 449 zł / rok');
    expect(pasekHostingu(zProba(14)).podpis).toBe('14 dni za darmo, bez karty');
  });
});

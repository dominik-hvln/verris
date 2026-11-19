import { normalizujNazwe, sprawdzBriefMarki, sprawdzNazweMarki, sprawdzPolecenieMarki } from './znane-marki.ts';

const brief = (o: Partial<{ nazwa: string; opis: string; uwagi: string; podpis: string }>) => ({ nazwa: 'Piekarnia Zakwas', opis: 'Chleb na zakwasie.', ...o });

describe('blokada nazw znanych marek', () => {
  it('normalizacja: wielkość liter, polskie znaki, interpunkcja', () => {
    expect(normalizujNazwe('Żabka  & Coca-Cola!')).toBe('zabka and coca cola');
  });

  it('nazwa firmy = marka jednoznaczna (także w nazwie wielowyrazowej i zlepionej) → blokada z komunikatem', () => {
    for (const n of ['Nike', 'Studio NIKE Poznań', 'coca cola sklep', 'CocaColaShop', "McDonald's Swarzędz"]) {
      const w = sprawdzNazweMarki(n);
      expect(w, n).toHaveLength(1);
      expect(w[0].komunikat).toMatch(/to nazwa znanej marki\. Kreator marki nie projektuje znaków dla cudzych marek – wpisz nazwę swojej firmy\.$/);
    }
  });

  it('marka wieloznaczna blokuje tylko jako cała nazwa; zwykłe słowa w nazwach przechodzą', () => {
    expect(sprawdzNazweMarki('Puma')).toHaveLength(1);
    expect(sprawdzNazweMarki('Żabka')).toHaveLength(1);
    for (const n of ['Biedronka i Pszczoła', 'Szkoła Lot', 'Bolt i Nakrętka', 'Dom Plus', 'Szkoła muzyczna Allegro', 'Kwiaciarnia Lotos', 'Netto Księgowość', 'Ingrid Studio', 'Dinozaur']) {
      expect(sprawdzNazweMarki(n), n).toEqual([]);
    }
  });

  it('naśladowanie w opisie, uwagach i poleceniu: „jak X”, „w stylu X”, „podobne do X”, „à la X”', () => {
    expect(sprawdzBriefMarki(brief({ uwagi: 'Chcemy coś jak Nike, z ruchem' })).ok).toBe(false);
    expect(sprawdzBriefMarki(brief({ opis: 'Logo w stylu Apple, minimalistyczne' })).bledy[0].komunikat).toContain('„w stylu Apple”');
    expect(sprawdzBriefMarki(brief({ uwagi: 'coś podobnego do Żabki' })).ok).toBe(false); // forma odmieniona
    expect(sprawdzBriefMarki(brief({ uwagi: 'logo jak Adidasa, trzy paski' })).ok).toBe(false);
    expect(sprawdzBriefMarki(brief({ uwagi: 'kolory podobne do Orange' })).ok).toBe(false);
    expect(sprawdzPolecenieMarki('zrób à la Starbucks, zielone koło').ok).toBe(false);
    expect(sprawdzPolecenieMarki('jak logo firmy z naprzeciwka').ok).toBe(false);
    expect(sprawdzPolecenieMarki('skopiuj logo konkurencji').bledy[0].komunikat).toContain('nie kopiuje cudzych znaków');
  });

  it('zwykła wzmianka o marce bez naśladowania przechodzi (np. sklep sprzedaje buty Nike)', () => {
    expect(sprawdzBriefMarki(brief({ nazwa: 'Biegam Sklep', opis: 'Sklep biegowy: buty Nike, Asics i Puma, doradztwo.' })).ok).toBe(true);
    expect(sprawdzPolecenieMarki('więcej powietrza, jak u dobrego krawca').ok).toBe(true);
    expect(sprawdzPolecenieMarki('w stylu skandynawskim, jasno').ok).toBe(true);
    expect(sprawdzPolecenieMarki(undefined).ok).toBe(true);
  });
});

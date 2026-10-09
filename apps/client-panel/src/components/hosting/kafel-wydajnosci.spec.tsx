import { renderToStaticMarkup } from 'react-dom/server';
import { KafelWydajnosci } from './kafel-wydajnosci';

/**
 * Decyzja 09.10: % zostaje liczony od mocy planu, ale szczyt ponad 100% (autoskalowanie podniosło
 * limit) dostaje dopisek, skąd się wziął — przypadek z produkcji: 248% CPU przy planie 200% → 124%.
 */
const etykiety = ['10:00', '11:00', '12:00'];
const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('KafelWydajnosci', () => {
  it('szczyt ponad plan: % od planu i dopisek o autoskalowaniu pod liczbą', () => {
    const t = tekst(renderToStaticMarkup(
      <KafelWydajnosci wartosci={[50, 248, 120]} etykiety={etykiety} limitPlanu={200} autoskalowanie />,
    ));
    expect(t).toContain('124 % planu · szczyt');
    expect(t).toContain('ponad plan dzięki autoskalowaniu');
    expect(t).toContain('dodatkowa moc w ramach Twojego limitu kosztów');
    expect(t).not.toContain('% limitu');
  });

  it('szczyt ponad plan przy wyłączonym teraz autoskalowaniu: dopisek zostaje, stopka ostrzega', () => {
    const t = tekst(renderToStaticMarkup(
      <KafelWydajnosci wartosci={[248]} etykiety={etykiety} limitPlanu={200} autoskalowanie={false} />,
    ));
    expect(t).toContain('ponad plan dzięki autoskalowaniu');
    expect(t).toContain('autoskalowanie wyłączone');
  });

  it('dokładnie 100% i mniej: bez dopisku', () => {
    for (const szczyt of [200, 170, 40]) {
      const t = tekst(renderToStaticMarkup(
        <KafelWydajnosci wartosci={[szczyt]} etykiety={etykiety} limitPlanu={200} autoskalowanie />,
      ));
      expect(t).not.toContain('ponad plan');
    }
  });

  it('blisko planu bez autoskalowania: podpowiedź; w normie: „w normie”; brak danych: kreska', () => {
    expect(tekst(renderToStaticMarkup(
      <KafelWydajnosci wartosci={[180]} etykiety={etykiety} limitPlanu={200} autoskalowanie={false} />,
    ))).toContain('blisko mocy planu — rozważ autoskalowanie');
    expect(tekst(renderToStaticMarkup(
      <KafelWydajnosci wartosci={[40]} etykiety={etykiety} limitPlanu={200} autoskalowanie />,
    ))).toContain('w normie');
    const pusty = tekst(renderToStaticMarkup(
      <KafelWydajnosci wartosci={[]} etykiety={[]} limitPlanu={200} autoskalowanie />,
    ));
    expect(pusty).toContain('—');
    expect(pusty).toContain('brak pomiarów z 24 h');
  });
});

/**
 * @jest-environment jsdom
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { DualBars, Label, MiniBars, opisDualBars } from './v2';
import { plForm } from '@/lib/pl';

/**
 * P-12 (przejście klawiaturą i czytnikiem, 12.10): słupki pulpitu czytały „1 nowych zgłoszeń” — jednostka bez odmiany.
 */
describe('MiniBars – odmiana jednostki', () => {
  it('jednostka jako funkcja: „1 nowe zgłoszenie”, „3 nowe zgłoszenia”, „5 nowych zgłoszeń”', () => {
    const html = renderToStaticMarkup(
      <MiniBars values={[1, 3, 5]} labels={['pon.', 'wt.', 'śr.']} unit={(v) => plForm(v, 'nowe zgłoszenie', 'nowe zgłoszenia', 'nowych zgłoszeń')} />,
    );
    expect(html).toContain('aria-label="1 nowe zgłoszenie, pon."');
    expect(html).toContain('aria-label="3 nowe zgłoszenia, wt."');
    expect(html).toContain('aria-label="5 nowych zgłoszeń, śr."');
  });

  it('jednostka jako tekst działa jak dotąd', () => {
    expect(renderToStaticMarkup(<MiniBars values={[7]} labels={['pon.']} unit="pkt EKO" />)).toContain('aria-label="7 pkt EKO, pon."');
  });
});

/** A3-4 — pulpit: ~57 przystanków Tab w wykresach, z czego 24 niewidoczne (prostokąty SVG w role="img"). */
describe('wykresy – przystanki Tab', () => {
  it('MiniBars: tabindex tylko na słupkach z wartością, zero dalej ma etykietę dla czytnika', () => {
    const html = renderToStaticMarkup(<MiniBars values={[0, 2, 0]} labels={['pon.', 'wt.', 'śr.']} unit="pkt EKO" />);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="0 pkt EKO, pon."');
  });

  it('DualBars: żaden słupek nie łapie fokusu, a etykieta wykresu ma sumy i miesiące z wartością', () => {
    const html = renderToStaticMarkup(
      <DualBars labels={['wrz', 'paź', 'lis']} a={[0, 50, 0]} b={[0, 20, 0]} aLabel="Doładowania" bLabel="Wydatki" format={(v) => `${v} K`} />,
    );
    expect(html).not.toContain('tabindex');
    expect(html).toContain('aria-label="Doładowania i Wydatki, wrz – lis: razem 50 K i 20 K. paź: 50 K i 20 K."');
    expect(opisDualBars(['sty'], [0], [0], 'A', 'B')).toBe('A i B, sty: razem 0 i 0.');
  });

  it('P4-7: Label (nagłówki kart) co najmniej 12,5 px', () => {
    expect(renderToStaticMarkup(<Label>Usługi</Label>)).toContain('text-[12.5px]');
  });
});


/**
 * @jest-environment jsdom
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MiniBars } from './v2';
import { plForm } from '@/lib/pl';

/**
 * P-12 (przejście klawiaturą i czytnikiem, 12.10): słupki pulpitu czytały „1 nowych zgłoszeń” — jednostka bez odmiany.
 */
describe('MiniBars — odmiana jednostki', () => {
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


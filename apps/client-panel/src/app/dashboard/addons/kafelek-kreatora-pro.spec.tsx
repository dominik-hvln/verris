import { renderToStaticMarkup } from 'react-dom/server';
import { CENA_KREATORA_PRO } from '@verris/kreator/klient';
import { KafelekKreatoraPro } from './kafelek-kreatora-pro';

/** Paczka 121 – kafelek Kreatora Pro w Dodatkach prowadzi do zakupu na stronie kreatora. */
const pro = (o: Record<string, unknown> = {}) => ({
  planId: 'p1', cena: CENA_KREATORA_PRO, zakup: { mozliwy: true, powod: null }, abonament: null, ...o,
});

it('bez abonamentu: kafelek z ceną netto i brutto i linkiem do karty Kreatora Pro', () => {
  const html = renderToStaticMarkup(<KafelekKreatoraPro stan={{ dostep: true, cenaPro: CENA_KREATORA_PRO, pro: pro() as never }} />);
  expect(html).toContain('href="/dashboard/kreator#kreator-pro"');
  expect(html).toContain('9,90 zł brutto/mies. (8,05 zł netto) albo 99 zł brutto/rok (80,49 zł netto)');
});

it('w próbie hostingu: kafelek z powodem („po opłaceniu hostingu”); z abonamentem albo bez dostępu – brak kafelka', () => {
  const wProbie = renderToStaticMarkup(
    <KafelekKreatoraPro stan={{ dostep: true, cenaPro: CENA_KREATORA_PRO, pro: pro({ zakup: { mozliwy: false, powod: 'Kreator Pro kupisz po opłaceniu hostingu.' } }) as never }} />,
  );
  expect(wProbie).toContain('po opłaceniu hostingu');
  expect(renderToStaticMarkup(<KafelekKreatoraPro stan={{ dostep: true, cenaPro: CENA_KREATORA_PRO, pro: pro({ abonament: { id: 's' } }) as never }} />)).toBe('');
  expect(renderToStaticMarkup(<KafelekKreatoraPro stan={{ dostep: false, cenaPro: CENA_KREATORA_PRO, pro: pro() as never }} />)).toBe('');
  expect(renderToStaticMarkup(<KafelekKreatoraPro stan={null} />)).toBe('');
});

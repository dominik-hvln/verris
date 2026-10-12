import { renderToStaticMarkup } from 'react-dom/server';

/** M-33 — historia dodatków: zlecenie zamknięte przez zespół po polsku, z notatką albo powodem odmowy. */
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./addons-actions', () => ({ purchaseAddonAction: jest.fn() }));

import { AddonsClient, stanDodatku } from './addons-client';

const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const wiersz = (status: string, amount = '25', notatka: string | null = null) => ({
  id: `p-${status}-${amount}`,
  slug: 'dedicated_ip',
  name: 'Dedykowane IP',
  amount,
  status,
  createdAt: '2026-10-12T08:00:00Z',
  notatka,
  zamknietoAt: notatka ? '2026-10-12T10:00:00Z' : null,
});

describe('M-33 — stan dodatku w historii', () => {
  it('zrealizowany z notatką, zwrócony z powodem, bez opłaty — anulowany; w realizacji bez zmian', () => {
    expect(stanDodatku(wiersz('DONE', '25', 'Przydzielono IP 203.0.113.10'))).toBe('Zrealizowany — Przydzielono IP 203.0.113.10');
    expect(stanDodatku(wiersz('DONE'))).toBe('Zrealizowany');
    expect(stanDodatku(wiersz('REFUNDED', '25', 'Pula adresów IP jest wyczerpana.'))).toBe('Zwrócony — Pula adresów IP jest wyczerpana.');
    expect(stanDodatku(wiersz('REFUNDED', '0', 'Pula adresów IP jest wyczerpana.'))).toBe('Anulowany — Pula adresów IP jest wyczerpana.');
    expect(stanDodatku(wiersz('QUEUED'))).toBe('W realizacji');
  });

  it('Dodatki → Historia dodatków pokazuje nowy stan zamiast surowego kodu', () => {
    const html = renderToStaticMarkup(
      <AddonsClient
        overview={{
          catalog: [],
          prioritySupport: { active: false, until: null },
          purchased: [wiersz('REFUNDED', '25', 'Pula adresów IP jest wyczerpana.'), wiersz('DONE', '99', 'Skonfigurowaliśmy pocztę.')],
        }}
      />,
    );
    const t = tekst(html);
    expect(t).toContain('Zwrócony — Pula adresów IP jest wyczerpana.');
    expect(t).toContain('Zrealizowany — Skonfigurowaliśmy pocztę.');
    expect(t).not.toContain('REFUNDED');
  });
});

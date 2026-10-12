/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ProformaDto } from '@verris/contracts';

const zaplacProformeAction = jest.fn();
jest.mock('./actions', () => ({ zaplacProformeAction: (...a: unknown[]) => zaplacProformeAction(...a) }));

import { Proformy } from './proformy';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const pf = (o: Partial<ProformaDto>): ProformaDto => ({
  id: '00000000-0000-4000-8000-000000000001', numer: 'PRO/2026/10/0001', status: 'WYSTAWIONA', kwota: '49.20', netto: '40.00', vat: '9.20',
  waluta: 'PLN', wystawiono: '2026-10-12T08:00:00Z', termin: '2026-10-19T08:00:00Z', oplacono: null, anulowano: null,
  pozycje: [{ nazwa: 'Wdrożenie sklepu', brutto: '49.20' }], subscriptionId: null, faktura: null, ...o,
});

/** K4 — proformy w Płatnościach: „Zapłać” tylko przy proformie do zapłaty, błąd API widoczny przy proformie. */
describe('Proformy (panel klienta)', () => {
  it('Zapłać tylko przy WYSTAWIONEJ; opłacona pokazuje dokument; wskazana z linku wyróżniona; błąd przy proformie', async () => {
    zaplacProformeAction.mockResolvedValue({ ok: false, error: 'Ta proforma została anulowana — nie trzeba jej płacić.' });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const lista = [
      pf({}),
      pf({ id: '00000000-0000-4000-8000-000000000002', numer: 'PRO/2026/10/0002', status: 'OPLACONA', oplacono: '2026-10-12T09:00:00Z', faktura: { id: 'f1', number: 'VDR/2026/10/0003' } }),
      pf({ id: '00000000-0000-4000-8000-000000000003', numer: 'PRO/2026/10/0003', status: 'ANULOWANA' }),
    ];
    await act(async () => root.render(<Proformy proformy={lista} wskazana="00000000-0000-4000-8000-000000000001" />));

    expect(el.querySelectorAll('[data-akcja="zaplac-proforme"]')).toHaveLength(1);
    expect(el.textContent).toContain('1 proforma do zapłaty');
    expect(el.textContent).toContain('dokument VDR/2026/10/0003');
    expect(el.textContent).toContain('Anulowana');
    expect(el.querySelector('a[href="/api/billing/proformy/00000000-0000-4000-8000-000000000001/pdf"]')).not.toBeNull();
    expect(el.querySelector('[data-proforma="WYSTAWIONA"]')!.className).toContain('bg-raised');

    await act(async () => (el.querySelector('[data-akcja="zaplac-proforme"]') as HTMLButtonElement).click());
    expect(zaplacProformeAction).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('anulowana');
    act(() => root.unmount());
  });
});

/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const startTopupAction = jest.fn();
jest.mock('./actions', () => ({
  startTopupAction: (...a: unknown[]) => startTopupAction(...a),
  quoteTopupAction: jest.fn().mockResolvedValue(null),
  previewTopupPromoAction: jest.fn(),
}));

import { TopupCard } from './topup-card';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function renderuj(props: Parameters<typeof TopupCard>[0]) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<TopupCard {...props} />));
  return { el, root };
}

const metoda = (el: HTMLElement) => (el.querySelector('input[name="metoda"]') as HTMLInputElement).value;
const przyciskMetody = (el: HTMLElement, tekst: string) =>
  [...el.querySelectorAll('[aria-label="Sposób płatności"] button')].find((b) => b.textContent?.includes(tekst)) as HTMLButtonElement;

/** 2026-10-05 — Paynow główną bramką doładowań w PLN; Stripe zostaje jako opcja (karta, EUR/USD). */
describe('TopupCard — wybór bramki', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Paynow włączony: dla PLN domyślnie „BLIK, przelew, karta — przez Paynow”, Stripe do wyboru', async () => {
    const { el, root } = await renderuj({ balance: '10.00', paynowDostepny: true });
    const paynow = przyciskMetody(el, 'BLIK, przelew, karta');
    expect(paynow.textContent).toContain('przez Paynow');
    expect(paynow.getAttribute('aria-pressed')).toBe('true');
    expect(metoda(el)).toBe('paynow');
    expect(el.textContent).toContain('Płatność przez Paynow');
    await act(async () => przyciskMetody(el, 'płatność kartą').click());
    expect(metoda(el)).toBe('stripe');
    expect(paynow.getAttribute('aria-pressed')).toBe('false');
    act(() => root.unmount());
  });

  it('Paynow wyłączony: bez wyboru bramki, płatność przez Stripe jak dotąd', async () => {
    const { el, root } = await renderuj({ balance: '10.00' });
    expect(el.querySelector('[aria-label="Sposób płatności"]')).toBeNull();
    expect(metoda(el)).toBe('stripe');
    expect(el.textContent).toContain('Płatność online: w PLN karta, BLIK i Przelewy24');
    act(() => root.unmount());
  });

  it('wysłanie formularza przekazuje wybraną bramkę', async () => {
    startTopupAction.mockResolvedValue({ ok: true });
    const { el, root } = await renderuj({ balance: '10.00', paynowDostepny: true });
    const form = el.querySelector('form') as HTMLFormElement;
    await act(async () => form.requestSubmit());
    const fd = startTopupAction.mock.calls[0][0] as FormData;
    expect(fd.get('metoda')).toBe('paynow');
    expect(fd.get('currency')).toBe('PLN');
    act(() => root.unmount());
  });
});

it('05.10: klient nie widzi nazw dostawców zaplecza (mBank, Stripe)', async () => {
  for (const paynowDostepny of [true, false]) {
    const { el, root } = await renderuj({ balance: '10.00', paynowDostepny });
    expect(el.textContent).not.toMatch(/mBank|Stripe/);
    act(() => root.unmount());
  }
});

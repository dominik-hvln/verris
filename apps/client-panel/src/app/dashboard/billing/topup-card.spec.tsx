/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const startTopupAction = jest.fn();
const previewTopupPromoAction = jest.fn();
jest.mock('./actions', () => ({
  startTopupAction: (...a: unknown[]) => startTopupAction(...a),
  quoteTopupAction: jest.fn().mockResolvedValue(null),
  previewTopupPromoAction: (...a: unknown[]) => previewTopupPromoAction(...a),
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
describe('TopupCard – wybór bramki', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Paynow włączony: dla PLN domyślnie „BLIK, przelew, karta – przez Paynow”, Stripe do wyboru', async () => {
    const { el, root } = await renderuj({ balance: '10.00', paynowDostepny: true });
    const paynow = przyciskMetody(el, 'BLIK, przelew, karta');
    expect(paynow.textContent).toContain('przez Paynow');
    expect(paynow.getAttribute('aria-pressed')).toBe('true');
    expect(metoda(el)).toBe('paynow');
    // 09.10 — bez akapitu z opisem bramki/kursu NBP/faktur pod formularzem (decyzja Dominika: za długi).
    expect(el.textContent).not.toContain('kursie średnim NBP');
    await act(async () => przyciskMetody(el, 'płatność kartą').click());
    expect(metoda(el)).toBe('stripe');
    expect(paynow.getAttribute('aria-pressed')).toBe('false');
    act(() => root.unmount());
  });

  it('Paynow wyłączony: bez wyboru bramki, płatność przez Stripe jak dotąd', async () => {
    const { el, root } = await renderuj({ balance: '10.00' });
    expect(el.querySelector('[aria-label="Sposób płatności"]')).toBeNull();
    expect(metoda(el)).toBe('stripe');
    expect(el.textContent).not.toContain('Płatność online');
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

// Decyzja 07.10: kody promocyjne Verris nie obejmują klientów resellera.
it('klient resellera: bez pola kodu promocyjnego przy doładowaniu', async () => {
  const { el, root } = await renderuj({ balance: '0', bezKodu: true });
  expect(el.querySelector('[aria-label="Kod bonusowy do wpłaty"]')).toBeNull();
  act(() => root.unmount());
  const zwykly = await renderuj({ balance: '0' });
  expect(zwykly.el.querySelector('[aria-label="Kod bonusowy do wpłaty"]')).not.toBeNull();
  act(() => zwykly.root.unmount());
});

// P1-01 / P4-1 (beta 3.11): pole kodu przy doładowaniu było drugim <form> wewnątrz formularza doładowania —
// „Sprawdź” wysyłał formularz GET-em, strona się przeładowywała, a kod znikał bez komunikatu.
describe('P1-01 – kod przy doładowaniu bez zagnieżdżonego formularza', () => {
  beforeEach(() => jest.clearAllMocks());

  it('w karcie jest dokładnie jeden <form>, „Sprawdź” nie wysyła doładowania, kod zostaje', async () => {
    previewTopupPromoAction.mockResolvedValue({ ok: false, error: 'Ten kod nie jest kodem procentowym do doładowania portfela.' });
    const { el, root } = await renderuj({ balance: '0' });
    expect(el.querySelectorAll('form')).toHaveLength(1);
    expect(el.querySelector('form form')).toBeNull();
    const pole = el.querySelector('[aria-label="Kod bonusowy do wpłaty"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(pole, 'BETA-TG8KMN');
      pole.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const sprawdz = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Sprawdź')!;
    expect(sprawdz.type).toBe('button');
    await act(async () => sprawdz.click());
    expect(startTopupAction).not.toHaveBeenCalled();
    expect(previewTopupPromoAction).toHaveBeenCalledWith('50', 'BETA-TG8KMN');
    expect(pole.value).toBe('BETA-TG8KMN');
    // Kod testera wpisany w złe pole: komunikat, gdzie go wpisać.
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('w karcie „Kod promocyjny”');
    act(() => root.unmount());
  });

  it('Enter w polu kodu sprawdza kod, a nie wysyła doładowania', async () => {
    previewTopupPromoAction.mockResolvedValue({ ok: true, preview: { code: 'BONUS10', percent: 10, bonusAmount: '5.00' } });
    const { el, root } = await renderuj({ balance: '0' });
    const pole = el.querySelector('[aria-label="Kod bonusowy do wpłaty"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(pole, 'BONUS10');
      pole.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => void pole.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(previewTopupPromoAction).toHaveBeenCalledWith('50', 'BONUS10');
    expect(startTopupAction).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

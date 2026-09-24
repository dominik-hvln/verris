/**
 * X-05 — akcje portfela: doładowanie, wycena VAT, kod promocyjny, auto-doładowanie.
 *
 * CO PILNUJE (pieniądze klienta):
 *  - Kwota poza zakresem 5–10 000 albo nieliczbowa NIE dociera do API ani do
 *    Stripe — klient dostaje komunikat, nie sesję płatności na złą kwotę.
 *  - Kwota idzie do API jako string z dokładnie dwoma miejscami po przecinku
 *    (grosze), a waluta spoza białej listy spada do PLN — nigdy nie przepuszczamy
 *    dowolnego kodu waluty z formularza.
 *  - Sukces kończy się przekierowaniem na URL z API; błąd API wraca jako
 *    komunikat, bez przekierowania.
 *  - Wycena VAT przy błędzie zwraca `null` (UI nie pokaże zmyślonej stawki).
 */

const apiFetch = jest.fn();
const redirect = jest.fn();
jest.mock('@/lib/api', () => {
  class ApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { ApiError, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});
jest.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

import { ApiError } from '@/lib/api';
import {
  previewTopupPromoAction,
  quoteTopupAction,
  redeemPromoAction,
  startTopupAction,
  upsertAutoTopupAction,
} from './actions';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const sentBody = (call = 0) => JSON.parse(apiFetch.mock.calls[call][1].body as string);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('X-05 startTopupAction', () => {
  it.each(['', 'abc', '4.99', '10000.01', '-50'])('kwota „%s" → błąd, bez API i bez przekierowania', async (amount) => {
    const res = await startTopupAction(form({ amount }));
    expect(res).toEqual({ ok: false, error: 'Podaj kwotę z zakresu 5–10000.' });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('brak pola kwoty → błąd', async () => {
    expect((await startTopupAction(new FormData())).ok).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('granice zakresu są dozwolone, kwota zaokrąglona do groszy', async () => {
    apiFetch.mockResolvedValue({ url: 'https://checkout.stripe.com/s/1' });
    await startTopupAction(form({ amount: '5' }));
    await startTopupAction(form({ amount: '10000' }));
    await startTopupAction(form({ amount: '49.999' }));
    expect(sentBody(0).amount).toBe('5.00');
    expect(sentBody(1).amount).toBe('10000.00');
    expect(sentBody(2).amount).toBe('50.00');
  });

  it('waluta z białej listy przechodzi, inna → PLN; kod promo przycięty, pusty → null', async () => {
    apiFetch.mockResolvedValue({ url: 'u' });
    await startTopupAction(form({ amount: '50', currency: 'EUR', promoCode: '  JESIEN  ' }));
    await startTopupAction(form({ amount: '50', currency: 'GBP', promoCode: '   ' }));
    expect(sentBody(0)).toEqual({ amount: '50.00', currency: 'EUR', promoCode: 'JESIEN' });
    expect(sentBody(1)).toEqual({ amount: '50.00', currency: 'PLN', promoCode: null });
    expect(apiFetch.mock.calls[0][0]).toBe('/billing/checkout-session');
    expect(apiFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('sukces → przekierowanie na URL sesji płatności', async () => {
    apiFetch.mockResolvedValue({ url: 'https://checkout.stripe.com/s/xyz' });
    await startTopupAction(form({ amount: '100' }));
    expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.com/s/xyz');
  });

  it('błąd API → komunikat API, bez przekierowania', async () => {
    apiFetch.mockRejectedValue(new ApiError('Kod promocyjny wygasł', 400, null));
    await expect(startTopupAction(form({ amount: '100', promoCode: 'X1Y' }))).resolves.toEqual({
      ok: false,
      error: 'Kod promocyjny wygasł',
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('błąd nie-Error → komunikat domyślny', async () => {
    apiFetch.mockRejectedValue('boom');
    expect(await startTopupAction(form({ amount: '100' }))).toEqual({
      ok: false,
      error: 'Nie udało się przygotować płatności.',
    });
  });
});

describe('X-05 quoteTopupAction — wycena VAT', () => {
  it('kwota poza zakresem → null bez pytania API', async () => {
    expect(await quoteTopupAction('2', 'PLN')).toBeNull();
    expect(await quoteTopupAction('x', 'PLN')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('wysyła kwotę jako liczbę z groszami, błąd API → null', async () => {
    apiFetch.mockResolvedValueOnce({ vatRate: 23 });
    expect(await quoteTopupAction('12.345', 'USD')).toEqual({ vatRate: 23 });
    expect(sentBody()).toEqual({ amount: 12.35, currency: 'USD' });
    apiFetch.mockRejectedValueOnce(new Error('x'));
    expect(await quoteTopupAction('50', 'PLN')).toBeNull();
  });
});

describe('X-05 kody promocyjne', () => {
  it('podgląd: zła kwota albo za krótki kod → błąd bez API', async () => {
    expect((await previewTopupPromoAction('1', 'KOD')).ok).toBe(false);
    expect(await previewTopupPromoAction('50', ' ab ')).toEqual({ ok: false, error: 'Wpisz kod promocyjny (min. 3 znaki).' });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('podgląd: kod przycięty, kwota w groszach', async () => {
    apiFetch.mockResolvedValue({ bonus: '5.00' });
    expect(await previewTopupPromoAction('50', ' KOD10 ')).toEqual({ ok: true, preview: { bonus: '5.00' } });
    expect(sentBody()).toEqual({ amount: '50.00', promoCode: 'KOD10' });
  });

  it('realizacja: zwraca kwotę z API, za krótki kod nie trafia do API', async () => {
    expect((await redeemPromoAction(form({ code: 'ab' }))).ok).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockResolvedValue({ amountPln: '20.00', code: 'PREZENT' });
    expect(await redeemPromoAction(form({ code: ' prezent ' }))).toEqual({ ok: true, amountPln: '20.00', code: 'PREZENT' });
    expect(sentBody()).toEqual({ code: 'prezent' });
  });
});

describe('X-05 upsertAutoTopupAction', () => {
  it('brak progu lub kwoty → błąd bez API', async () => {
    expect((await upsertAutoTopupAction(form({ enabled: 'on', thresholdPln: ' ', topupAmountPln: '50' }))).ok).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('checkbox „on" → enabled, brak → wyłączone; pusta karta → null', async () => {
    apiFetch.mockResolvedValue({ enabled: true });
    await upsertAutoTopupAction(form({ enabled: 'on', thresholdPln: ' 10 ', topupAmountPln: '50', localPaymentMethodId: 'pm_1' }));
    await upsertAutoTopupAction(form({ thresholdPln: '10', topupAmountPln: '50', localPaymentMethodId: '' }));
    expect(sentBody(0)).toEqual({ enabled: true, thresholdPln: '10', topupAmountPln: '50', localPaymentMethodId: 'pm_1' });
    expect(sentBody(1)).toEqual({ enabled: false, thresholdPln: '10', topupAmountPln: '50', localPaymentMethodId: null });
  });
});

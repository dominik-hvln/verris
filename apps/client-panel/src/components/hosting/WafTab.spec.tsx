/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Noc 11→12.10 — zakładka WAF klienta: błąd odczytu stanu (sieć, 5xx, stara karta po wdrożeniu) nie udaje
 * „WAF będzie dostępny po aktywacji konta”, nie kasuje ostatniego stanu i daje „Spróbuj ponownie”.
 */
const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('@/app/dashboard/services/[id]/waf-actions', () => ({
  getWafStatus: (...a: unknown[]) => mockGet(...a),
  setWafMode: (...a: unknown[]) => mockSet(...a),
}));
jest.mock('@/components/hosting/MalwarePanel', () => ({ MalwarePanel: () => null }));

import WafTab from './WafTab';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const STAN = {
  accountId: 'a1',
  domain: 'klient.pl',
  mode: 'ON',
  appliedAt: '2026-10-11T10:00:00Z',
  lastTask: { id: 't1', status: 'QUEUED', errorMessage: null, createdAt: '2026-10-11T19:47:00Z', completedAt: null },
};

let root: Root;
let el: HTMLElement;
const zamontuj = async () => {
  await act(async () => root.render(<WafTab serviceId="s1" />));
};

beforeEach(() => {
  jest.clearAllMocks();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
  el.remove();
  jest.useRealTimers();
});

it('błąd odczytu przy wejściu: komunikat i „Spróbuj ponownie”, nie „dostępny po aktywacji”; ponowienie wczytuje stan', async () => {
  mockGet.mockResolvedValueOnce({ ok: false, brakKonta: false, error: 'Nie udało się wczytać stanu zapory — spróbuj ponownie.' });
  await zamontuj();
  expect(el.textContent).toContain('Nie udało się wczytać stanu zapory');
  expect(el.textContent).not.toContain('po aktywacji konta');
  mockGet.mockResolvedValueOnce({ ok: true, status: { ...STAN, lastTask: null } });
  await act(async () => el.querySelector<HTMLButtonElement>('[data-akcja="ponow-odczyt-waf"]')!.click());
  expect(mockGet).toHaveBeenCalledTimes(2);
  expect(el.textContent).toContain('Zapora aplikacji (WAF)');
  expect(el.querySelector('[data-akcja="ponow-odczyt-waf"]')).toBeNull();
});

it('akcja serwera odrzucona (stara karta po wdrożeniu): komunikat zamiast wiecznego „Wczytywanie…”', async () => {
  mockGet.mockRejectedValueOnce(new Error('Server Action "x" was not found on the server.'));
  await zamontuj();
  expect(el.textContent).toContain('Nie udało się wczytać stanu zapory');
  expect(el.textContent).not.toContain('Server Action');
});

it('brak konta hostingowego (400 z API) — dalej „WAF będzie dostępny po aktywacji”', async () => {
  mockGet.mockResolvedValueOnce({ ok: false, brakKonta: true, error: 'Usługa nie ma jeszcze konta hostingowego.' });
  await zamontuj();
  expect(el.textContent).toContain('WAF będzie dostępny po aktywacji konta hostingowego.');
});

it('błąd w trakcie odpytywania (zmiana trybu w toku): stan zostaje, komunikat o nieaktualnym stanie, odpytywanie trwa', async () => {
  jest.useFakeTimers();
  mockGet.mockResolvedValueOnce({ ok: true, status: STAN });
  await zamontuj();
  expect(el.textContent).toContain('Stosowanie zmian na serwerze');
  mockGet.mockResolvedValueOnce({ ok: false, brakKonta: false, error: 'Nie udało się wczytać stanu zapory — spróbuj ponownie.' });
  await act(async () => jest.advanceTimersByTime(5000));
  expect(el.textContent).toContain('Zapora aplikacji (WAF)');
  expect(el.textContent).toContain('pokazany stan może być nieaktualny');
  expect(el.textContent).not.toContain('po aktywacji konta');
  mockGet.mockResolvedValueOnce({ ok: true, status: { ...STAN, lastTask: { ...STAN.lastTask, status: 'COMPLETED', completedAt: '2026-10-11T19:48:00Z' } } });
  await act(async () => jest.advanceTimersByTime(5000));
  expect(mockGet).toHaveBeenCalledTimes(3);
  expect(el.textContent).not.toContain('pokazany stan może być nieaktualny');
  expect(el.textContent).not.toContain('Stosowanie zmian na serwerze');
});

it('teksty dla klienta bez nazw oprogramowania zapory', async () => {
  mockGet.mockResolvedValueOnce({ ok: true, status: { ...STAN, lastTask: null } });
  await zamontuj();
  expect(el.textContent).not.toMatch(/OWASP|ModSecurity|CRS/);
});

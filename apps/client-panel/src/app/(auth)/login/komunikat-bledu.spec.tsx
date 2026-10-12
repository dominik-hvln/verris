/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import axe from 'axe-core';

/**
 * P-12 (przejście VoiceOverem 12.10): po złym haśle komunikat błędu nie był odczytywany od razu —
 * pojawiał się w nowym <div> bez roli. Teraz: region role="alert" istnieje w DOM przed błędem,
 * błąd trafia do niego, a pola e-mail i hasło mają aria-invalid i aria-describedby → komunikat.
 */
const mockLogin = jest.fn();
jest.mock('./actions', () => ({
  submitLogin: (...a: unknown[]) => mockLogin(...a),
  submitTwoFactor: jest.fn(async () => ({})),
}));
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock('@/components/captcha', () => ({ Captcha: () => null }));
jest.mock('./passkey-login-button', () => ({ PasskeyLoginButton: () => null }));
jest.mock('./passkey-conditional-autofill', () => ({ PasskeyConditionalAutofill: () => null }));

import LoginPage from './page';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

const BLAD = 'Nieprawidłowy e-mail lub hasło.';

let root: Root;
let el: HTMLElement;
beforeEach(async () => {
  mockLogin.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<LoginPage />));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

async function wyslij() {
  // Pola są `required` — bez wartości przeglądarka (i jsdom) nie wyśle formularza.
  (el.querySelector('#email') as HTMLInputElement).value = 'jan@kowalski.pl';
  (el.querySelector('#password') as HTMLInputElement).value = 'zle-haslo';
  await act(async () => el.querySelector('form')!.requestSubmit());
  expect(mockLogin).toHaveBeenCalledTimes(1);
}
const region = () => el.querySelector<HTMLElement>('form [role="alert"], form [aria-live="assertive"]');

describe('logowanie — komunikat błędu dla czytnika ekranu', () => {
  it('region żywy istnieje (pusty) zanim pojawi się błąd', () => {
    expect(region()).not.toBeNull();
    expect(region()!.textContent).toBe('');
    expect(el.querySelector('#password')!.hasAttribute('aria-invalid')).toBe(false);
  });

  it('po złym haśle komunikat trafia do regionu, a pola wskazują go jako opis błędu', async () => {
    const przed = region();
    mockLogin.mockResolvedValue({ error: BLAD, email: 'jan@kowalski.pl' });
    await wyslij();
    expect(region()).toBe(przed); // ten sam węzeł — czytnik śledzi go od załadowania strony
    expect(region()!.textContent).toContain(BLAD);
    for (const sel of ['#email', '#password']) {
      const pole = el.querySelector(sel)!;
      expect(pole.getAttribute('aria-invalid')).toBe('true');
      const opis = pole.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent ?? '');
      expect(opis.join(' ')).toContain(BLAD);
    }
    const wynik = await axe.run(el, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    expect(wynik.violations.map((v) => v.id)).toEqual([]);
  });

  it('kolejna próba: region pustoszeje na czas wysyłki, więc ten sam błąd zostanie ogłoszony ponownie', async () => {
    mockLogin.mockResolvedValue({ error: BLAD });
    await wyslij();
    expect(region()!.textContent).toContain(BLAD);
    let odpowiedz: (v: unknown) => void = () => {};
    mockLogin.mockReset();
    mockLogin.mockReturnValue(new Promise((r) => (odpowiedz = r)));
    await wyslij();
    expect(region()!.textContent).toBe('');
    await act(async () => odpowiedz({ error: BLAD }));
    expect(region()!.textContent).toContain(BLAD);
  });

  it('niepotwierdzony e-mail: komunikat w regionie, pola nie są oznaczone jako błędne', async () => {
    mockLogin.mockResolvedValue({ error: 'Potwierdź adres e-mail.', emailUnverified: true, email: 'jan@kowalski.pl' });
    await wyslij();
    expect(region()!.textContent).toContain('Potwierdź adres e-mail.');
    expect(el.querySelector('#password')!.hasAttribute('aria-invalid')).toBe(false);
  });
});

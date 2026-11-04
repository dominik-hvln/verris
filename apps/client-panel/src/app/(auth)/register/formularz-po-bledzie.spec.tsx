/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * P5-08 (paczka 109) — po błędzie z serwera (hasło z wycieku, limit prób) formularz rejestracji zostawia imię,
 * nazwisko, e-mail i zgody. Na starym kodzie pola były niekontrolowane i React czyścił je po akcji formularza.
 * Wskaźnik hasła nie obiecuje, że hasło „nie jest popularne” — o wyciekach rozstrzyga dopiero serwer.
 */
const mockAkcja = jest.fn();
jest.mock('./actions', () => ({ submitRegister: (...a: unknown[]) => mockAkcja(...a) }));
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
jest.mock('@/components/captcha', () => ({ Captcha: () => null }));

import RegisterPage from './page';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function wpisz(el: HTMLInputElement, wartosc: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, wartosc);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

it('po błędzie z serwera pola i zgody zostają', async () => {
  mockAkcja.mockReset().mockResolvedValue({ error: 'To hasło pojawiło się w znanych wyciekach.' });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<RegisterPage />));
  const pole = (id: string) => el.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    wpisz(pole('firstName'), 'Tomek');
    wpisz(pole('lastName'), 'Nowak');
    wpisz(pole('email'), 'tomek@firma.pl');
    wpisz(pole('password'), 'Password123!');
  });
  for (const n of ['acceptTerms', 'acceptPrivacy']) {
    await act(async () => el.querySelector<HTMLInputElement>(`input[name="${n}"]`)!.click());
  }
  expect(el.textContent).toContain('sprawdzimy też, czy hasło nie pojawiło się w znanych wyciekach');
  expect(el.textContent).not.toContain('Nie jest popularnym hasłem');

  await act(async () => el.querySelector('form')!.requestSubmit());
  expect(mockAkcja).toHaveBeenCalledTimes(1);
  expect(el.textContent).toContain('znanych wyciekach.');
  expect(pole('firstName').value).toBe('Tomek');
  expect(pole('lastName').value).toBe('Nowak');
  expect(pole('email').value).toBe('tomek@firma.pl');
  expect(el.querySelector<HTMLInputElement>('input[name="acceptTerms"]')!.checked).toBe(true);
  expect(el.querySelector<HTMLInputElement>('input[name="acceptPrivacy"]')!.checked).toBe(true);
  act(() => root.unmount());
  document.body.innerHTML = '';
});

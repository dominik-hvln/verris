/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * P-12 — ten sam wzorzec co przy logowaniu (komunikat-bledu.spec.tsx) w pozostałych formularzach
 * bez sesji: rejestracja, reset hasła (prośba i nowe hasło), ponowny link potwierdzający. Region
 * role="alert" musi być w DOM, zanim pojawi się błąd — inaczej VoiceOver go nie ogłasza.
 */
const mockAkcja = jest.fn();
jest.mock('./register/actions', () => ({ submitRegister: (...a: unknown[]) => mockAkcja(...a) }));
jest.mock('./forgot-password/actions', () => ({ requestPasswordReset: (...a: unknown[]) => mockAkcja(...a) }));
jest.mock('./reset-password/actions', () => ({ confirmPasswordReset: (...a: unknown[]) => mockAkcja(...a) }));
jest.mock('./verify-email/actions', () => ({ requestEmailVerificationResend: (...a: unknown[]) => mockAkcja(...a) }));
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('token=abc&email=jan%40kowalski.pl') }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
jest.mock('@/components/captcha', () => ({ Captcha: () => null }));

import RegisterPage from './register/page';
import ForgotPasswordPage from './forgot-password/page';
import ResetPasswordPage from './reset-password/page';
import ResendVerificationPage from './resend-verification/page';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const BLAD = 'Coś poszło nie tak — spróbuj ponownie.';

describe.each([
  ['rejestracja', RegisterPage],
  ['reset hasła — prośba', ForgotPasswordPage],
  ['reset hasła — nowe hasło', ResetPasswordPage],
  ['ponowny link potwierdzający', ResendVerificationPage],
])('%s', (_n, Strona) => {
  it('pusty region role=alert w formularzu przed błędem, po błędzie komunikat w tym samym regionie', async () => {
    mockAkcja.mockReset().mockResolvedValue({ error: BLAD });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => root.render(<Strona />));
    const region = el.querySelector<HTMLElement>('form [role="alert"]');
    expect(region).not.toBeNull();
    expect(region!.textContent).toBe('');

    const form = el.querySelector('form')!;
    form.querySelectorAll<HTMLInputElement>('input[required]').forEach((i) => {
      if (i.type === 'checkbox') i.checked = true;
      else i.value = i.type === 'email' ? 'jan@kowalski.pl' : 'Bardzo-Dlugie-Haslo-2026!';
    });
    await act(async () => form.requestSubmit());
    expect(mockAkcja).toHaveBeenCalledTimes(1);
    expect(el.querySelector('form [role="alert"]')).toBe(region);
    expect(region!.textContent).toContain(BLAD);
    act(() => root.unmount());
    document.body.innerHTML = '';
  });
});

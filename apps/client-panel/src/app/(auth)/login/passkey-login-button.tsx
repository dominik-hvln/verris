'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { getPasskeyAvailability, getPasskeyLoginOptions, verifyPasskeyLogin } from './passkey-actions';

/**
 * Logowanie passkey (discoverable credentials) — bez wpisywania e-mail.
 * Przeglądarka pokazuje passkeys zapisane dla panel.verris.pl.
 */
export function PasskeyLoginButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();
  const supported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  useEffect(() => {
    void getPasskeyAvailability().then(setAvailable);
  }, []);

  // Ukryj przycisk, gdy przeglądarka nie wspiera lub serwer nie ma RP passkey.
  if (!supported || available === false) return null;

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const emailInput = document.getElementById('email') as HTMLInputElement | null;
      const email = emailInput?.value?.trim() || undefined;
      const opt = await getPasskeyLoginOptions(email);
      if (!opt.ok) {
        setError(opt.error);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asseResp = await startAuthentication({ optionsJSON: opt.options as any });
        const res = await verifyPasskeyLogin(asseResp);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push('/dashboard');
        router.refresh();
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'AbortError') {
          setError('Logowanie passkey anulowane lub przerwane. Spróbuj ponownie.');
        } else if (name === 'InvalidStateError') {
          setError('Passkey jest w użyciu. Odśwież stronę i spróbuj ponownie.');
        } else {
          setError(
            err instanceof Error && err.message
              ? `Nie udało się: ${err.message}`
              : 'Nie znaleziono passkey dla Verris na tym urządzeniu.',
          );
        }
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="w-full rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? 'Logowanie…' : 'Zaloguj się passkey'}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Bez hasła — wybierz passkey zapisany na tym urządzeniu.
      </p>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}

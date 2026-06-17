'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { fetchPasskeyLoginOptions, verifyPasskeyLoginClient } from '@/lib/passkey-client';
import { getPasskeyAvailability, setPasskeyAuthCookie } from './passkey-actions';

/**
 * Logowanie passkey (discoverable credentials) — bez wpisywania e-mail.
 * WebAuthn wymaga user gesture: opcje pobieramy z przeglądarki (nie Server Action).
 */
export function PasskeyLoginButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [isPending, setIsPending] = useState(false);
  const prefetchedOptions = useRef<unknown | null>(null);
  const supported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  useEffect(() => {
    void getPasskeyAvailability().then(setAvailable);
  }, []);

  if (!supported || available === false) return null;

  const loadOptions = async (email?: string) => {
    const options = await fetchPasskeyLoginOptions(email);
    prefetchedOptions.current = options;
    return options;
  };

  const onPointerDown = () => {
    const emailInput = document.getElementById('email') as HTMLInputElement | null;
    const email = emailInput?.value?.trim() || undefined;
    void loadOptions(email).catch(() => {
      prefetchedOptions.current = null;
    });
  };

  const onClick = async () => {
    setError(null);
    setIsPending(true);
    try {
      const emailInput = document.getElementById('email') as HTMLInputElement | null;
      const email = emailInput?.value?.trim() || undefined;
      const options = prefetchedOptions.current ?? (await loadOptions(email));
      prefetchedOptions.current = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asseResp = await startAuthentication({ optionsJSON: options as any });
      const { access_token } = await verifyPasskeyLoginClient(asseResp);
      await setPasskeyAuthCookie(access_token);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      prefetchedOptions.current = null;
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        setError('Logowanie passkey anulowane lub przerwane. Spróbuj ponownie.');
      } else if (name === 'InvalidStateError') {
        setError('Passkey jest w użyciu. Odśwież stronę i spróbuj ponownie.');
      } else {
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Nie znaleziono passkey dla Verris na tym urządzeniu.',
        );
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onPointerDown={onPointerDown}
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

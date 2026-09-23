'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { fetchPasskeyLoginOptions, verifyPasskeyLoginClient } from '@/lib/passkey-client';
import { getPasskeyAvailability, setPasskeyAuthCookie } from './passkey-actions';

// Wsparcie WebAuthn nie zmienia się w trakcie życia strony — nie ma czego subskrybować.
const subscribeNoop = () => () => {};

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
  // Serwer (brak window) i hydratacja widzą `false`, klient po hydratacji — faktyczne
  // wsparcie; bez tego różny HTML → hydration mismatch (React #418).
  const supported = useSyncExternalStore(
    subscribeNoop,
    () => typeof window.PublicKeyCredential !== 'undefined',
    () => false,
  );

  // Safari wymaga synchronicznego startAuthentication() w geście — dlatego
  // prefetchujemy opcje (discoverable, świeży challenge) zawczasu: na montażu
  // i na focus/hover. onClick wywoła wtedy startAuthentication bez await przed nim.
  const prefetch = useCallback(() => {
    void fetchPasskeyLoginOptions()
      .then((options) => {
        prefetchedOptions.current = options;
      })
      .catch(() => {
        prefetchedOptions.current = null;
      });
  }, []);

  useEffect(() => {
    // Prefetch NATYCHMIAST (równolegle do sprawdzania dostępności) — by w chwili
    // kliknięcia opcje były gotowe i startAuthentication ruszyło synchronicznie
    // w geście (krytyczne dla Safari). Wsparcie czytamy wprost z `window`, żeby
    // efekt nie odpalał drugi raz po przełączeniu `supported` po hydratacji.
    if (typeof window.PublicKeyCredential !== 'undefined') prefetch();
    void getPasskeyAvailability().then((ok) => {
      setAvailable(ok);
    });
  }, [prefetch]);

  if (!supported || available === false) return null;

  const onClick = async () => {
    setError(null);
    setIsPending(true);
    try {
      const options = prefetchedOptions.current ?? (await fetchPasskeyLoginOptions());
      prefetchedOptions.current = null;

      const asseResp = await startAuthentication({
        optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
      });
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
      prefetch();
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onPointerEnter={prefetch}
        onFocus={prefetch}
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

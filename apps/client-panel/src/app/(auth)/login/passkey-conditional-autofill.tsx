'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { browserSupportsWebAuthnAutofill, startAuthentication } from '@simplewebauthn/browser';
import { fetchPasskeyLoginOptions, verifyPasskeyLoginClient } from '@/lib/passkey-client';
import { setPasskeyAuthCookie } from './passkey-actions';
import { isAppleWebKit } from './passkey-env';

/**
 * Conditional UI — passkey w autouzupełnianiu pola e-mail (Safari / Chrome).
 * Działa tylko gdy passkey jest discoverable (zapisany na urządzeniu dla tej domeny).
 */
export function PasskeyConditionalAutofill() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        if (typeof window.PublicKeyCredential === 'undefined') return;
        // Safari/WebKit: NIE uruchamiamy conditional UI, bo oczekująca ceremonia
        // blokuje modalne logowanie przyciskiem (arkusz passkey się nie otwiera).
        // Tam polegamy wyłącznie na przycisku „Zaloguj się passkey".
        if (isAppleWebKit()) return;
        if (!(await browserSupportsWebAuthnAutofill())) return;

        const options = await fetchPasskeyLoginOptions();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asseResp = await startAuthentication({
          optionsJSON: options as any,
          useBrowserAutofill: true,
        });
        const { access_token } = await verifyPasskeyLoginClient(asseResp);
        await setPasskeyAuthCookie(access_token);
        router.push('/dashboard');
        router.refresh();
      } catch {
        // Użytkownik może zalogować się hasłem lub przyciskiem passkey.
      }
    })();
  }, [router]);

  return null;
}

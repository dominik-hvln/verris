"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { RegionBledu } from "@/components/region-bledu";
import { Captcha } from "@/components/captcha";
import { AUTH_BLAD, AUTH_ETYKIETA, AUTH_INFO, AUTH_INPUT, AUTH_LINK, AUTH_PRZYCISK, AuthShell } from "@/components/auth-shell";

type ForgotState = { error?: string; ok?: boolean };

const initialState: ForgotState = {};

// 14.10 (Dominik): wygląd jak ekran logowania — wspólna AuthShell i kolory z tokenów panelu.
export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <AuthShell
      haslo
      stopka={
        <>
          Pamiętasz hasło?{" "}
          <Link href="/login" className={`${AUTH_LINK} underline underline-offset-4`}>
            Zaloguj się
          </Link>
        </>
      }
    >
      <div className="border-b border-border p-8 pb-6">
        <h1 className="font-display text-xl font-bold text-foreground">Reset hasła</h1>
        <p className="mt-1 text-sm text-muted-foreground">Wyślemy link na Twój e-mail (ważny 15 minut).</p>
      </div>

      {state.ok ? (
        <div className="space-y-4 p-8">
          <div className={AUTH_INFO}>
            <Mail aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p>Jeśli konto z tym adresem istnieje, wysłaliśmy instrukcję resetu. Sprawdź skrzynkę i folder spam.</p>
          </div>
          <Link href="/login" className={`block text-center text-sm ${AUTH_LINK}`}>
            Wróć do logowania
          </Link>
        </div>
      ) : (
        <form action={action}>
          <div className="space-y-5 p-8">
            <RegionBledu id="reset-blad">
              {!pending && state?.error ? (
                <div className={AUTH_BLAD}>
                  <AlertCircle aria-hidden className="h-5 w-5 shrink-0" />
                  {state.error}
                </div>
              ) : null}
            </RegionBledu>

            <div className="space-y-2">
              <label htmlFor="email" className={AUTH_ETYKIETA}>
                Adres e-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="jan@kowalski.pl"
                aria-invalid={!pending && state?.error ? true : undefined}
                aria-describedby={!pending && state?.error ? "reset-blad" : undefined}
                className={AUTH_INPUT}
              />
            </div>

            <Captcha action="password-reset" />

            <button type="submit" disabled={pending} className={AUTH_PRZYCISK}>
              {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              {pending ? "Wysyłanie…" : "Wyślij link"}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

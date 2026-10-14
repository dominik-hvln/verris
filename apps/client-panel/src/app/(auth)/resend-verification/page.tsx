"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { requestEmailVerificationResend } from "../verify-email/actions";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { RegionBledu } from "@/components/region-bledu";
import { AUTH_BLAD, AUTH_INFO, AuthShell } from "@/components/auth-shell";

type ResendState = { error?: string; ok?: boolean };

const initialState: ResendState = {};

function ResendForm() {
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get("email") ?? "";
  const [state, action, pending] = useActionState(requestEmailVerificationResend, initialState);

  if (state.ok) {
    return (
      <div className="p-8 space-y-4">
        <div className={AUTH_INFO}>
          <Mail aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p>
            Jeśli konto oczekuje na potwierdzenie, wysłaliśmy nowy link. Sprawdź skrzynkę i folder spam.
          </p>
        </div>
        <Link href="/login" className="block text-center text-sm font-semibold text-accent hover:text-verris-tip">
          Wróć do logowania
        </Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <div className="p-8 space-y-5">
        <RegionBledu id="ponow-blad">
          {!pending && state?.error ? (
            <div className={AUTH_BLAD}>
              <AlertCircle aria-hidden className="h-5 w-5 shrink-0" />
              {state.error}
            </div>
          ) : null}
        </RegionBledu>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-semibold text-verris-body">
            Adres e-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={defaultEmail}
            className="w-full rounded-xl border border-border bg-verris-pine/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold py-3.5 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Wyślij link ponownie
        </button>
      </div>
    </form>
  );
}

export default function ResendVerificationPage() {
  return (
    <AuthShell haslo>
      <div className="border-b border-border p-8 pb-6">
        <h1 className="font-display text-xl font-bold text-foreground">Potwierdzenie e-mail</h1>
        <p className="mt-1 text-sm text-muted-foreground">Wyślemy ponownie link aktywacyjny.</p>
      </div>
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Ładowanie…</div>}>
        <ResendForm />
      </Suspense>
    </AuthShell>
  );
}

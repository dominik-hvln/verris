"use client";

import { Suspense, useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmEmailVerification } from "./actions";
import { AlertCircle, Loader2 } from "lucide-react";
import { AUTH_BLAD, AuthShell } from "@/components/auth-shell";

type VerifyState = { error?: string };

const initialState: VerifyState = {};

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, action, pending] = useActionState(confirmEmailVerification, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (!token || autoSubmitted.current || state.error) return;
    autoSubmitted.current = true;
    formRef.current?.requestSubmit();
  }, [token, state.error]);

  if (!token) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-sm text-destructive">
          Brak tokenu w linku. Otwórz potwierdzenie z wiadomości e-mail lub poproś o nowy link.
        </p>
        <Link
          href="/resend-verification"
          className="text-sm font-semibold text-accent hover:text-verris-tip"
        >
          Wyślij link ponownie
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="token" value={token} />
      <div className="p-8 space-y-5">
        {state.error && (
          <div className={AUTH_BLAD}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            {state.error}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Kliknij poniżej, aby potwierdzić adres e-mail i aktywować konto.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold py-3.5 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Potwierdź e-mail
        </button>
      </div>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell haslo>
      <div className="border-b border-border p-8 pb-6">
        <h1 className="font-display text-xl font-bold text-foreground">Potwierdzenie e-mail</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ostatni krok aktywacji konta Verris.</p>
      </div>
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Ładowanie…</div>}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}

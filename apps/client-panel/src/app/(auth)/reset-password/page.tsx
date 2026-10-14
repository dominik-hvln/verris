"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmPasswordReset } from "./actions";
import { AlertCircle, Loader2 } from "lucide-react";
import { RegionBledu } from "@/components/region-bledu";
import { AUTH_BLAD, AuthShell } from "@/components/auth-shell";

type ResetState = { error?: string };

const initialState: ResetState = {};

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, action, pending] = useActionState(confirmPasswordReset, initialState);

  if (!token) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-sm text-destructive">
          Brak tokenu w linku. Otwórz reset hasła z wiadomości e-mail lub poproś o nowy link.
        </p>
        <Link href="/forgot-password" className="text-sm font-semibold text-accent hover:text-verris-tip">
          Poproś o reset hasła
        </Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <div className="p-8 space-y-5">
        <RegionBledu id="nowe-haslo-blad">
          {!pending && state?.error ? (
            <div className={AUTH_BLAD}>
              <AlertCircle aria-hidden className="h-5 w-5 shrink-0" />
              {state.error}
            </div>
          ) : null}
        </RegionBledu>

        <div className="space-y-2">
          <label htmlFor="newPassword" className="text-sm font-semibold text-verris-body">
            Nowe hasło
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-xl border border-border bg-verris-pine/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-semibold text-verris-body">
            Powtórz hasło
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-xl border border-border bg-verris-pine/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold py-3.5 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Ustaw hasło
        </button>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell haslo>
      <div className="border-b border-border p-8 pb-6">
        <h1 className="font-display text-xl font-bold text-foreground">Nowe hasło</h1>
        <p className="mt-1 text-sm text-muted-foreground">Wybierz silne hasło do konta Verris.</p>
      </div>
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Ładowanie…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}

"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmPasswordReset } from "./actions";
import { AlertCircle, Loader2 } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";
import { VerrisLockup } from "@/components/logo";

type ResetState = { error?: string };

const initialState: ResetState = {};

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, action, pending] = useActionState(confirmPasswordReset, initialState);

  if (!token) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-sm text-rose-300">
          Link jest niepełny — otwórz go ponownie z wiadomości e-mail lub poproś o nowy link.
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
        {state.error && (
          <div className="flex items-center gap-3 p-4 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {state.error}
          </div>
        )}

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
    <div className="relative flex items-center justify-center min-h-screen bg-background py-12">
      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="mb-10 flex justify-center">
          <VerrisLockup size="lg" layout="vertical" className="items-center" />
        </div>
        <div className="relative rounded-[32px] p-px overflow-hidden">
          <SpinBorder className="opacity-30" />
          <div className="relative rounded-[calc(32px-1px)] border border-border bg-card/95 backdrop-blur-3xl">
            <div className="p-8 pb-6 border-b border-border">
              <h1 className="font-display text-xl font-bold text-foreground">Nowe hasło</h1>
              <p className="text-sm text-muted-foreground mt-1">Wybierz silne hasło do konta Verris.</p>
            </div>
            <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Ładowanie…</div>}>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

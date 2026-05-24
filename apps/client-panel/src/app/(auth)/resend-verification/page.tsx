"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { requestEmailVerificationResend } from "../verify-email/actions";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";

type ResendState = { error?: string; ok?: boolean };

const initialState: ResendState = {};

function ResendForm() {
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get("email") ?? "";
  const [state, action, pending] = useActionState(requestEmailVerificationResend, initialState);

  if (state.ok) {
    return (
      <div className="p-8 space-y-4">
        <div className="flex items-start gap-3 p-4 text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <Mail className="h-5 w-5 shrink-0 mt-0.5" />
          <p>
            Jeśli konto oczekuje na potwierdzenie, wysłaliśmy nowy link. Sprawdź skrzynkę i folder spam.
          </p>
        </div>
        <Link href="/login" className="block text-center text-sm font-semibold text-sky-400 hover:text-sky-300">
          Wróć do logowania
        </Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <div className="p-8 space-y-5">
        {state.error && (
          <div className="flex items-center gap-3 p-4 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {state.error}
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-semibold text-neutral-300">
            Adres e-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={defaultEmail}
            className="w-full rounded-xl border border-white/10 bg-[#121212]/50 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-black font-bold py-3.5 hover:bg-neutral-200 disabled:opacity-50"
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
    <div className="relative flex items-center justify-center min-h-screen bg-neutral-950 py-12">
      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="relative rounded-[32px] p-px overflow-hidden">
          <SpinBorder className="opacity-30" />
          <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/5">
            <div className="p-8 pb-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white">Potwierdzenie e-mail</h2>
              <p className="text-sm text-neutral-400 mt-1">Wyślemy ponownie link aktywacyjny.</p>
            </div>
            <Suspense fallback={<div className="p-8 text-neutral-500 text-sm">Ładowanie…</div>}>
              <ResendForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

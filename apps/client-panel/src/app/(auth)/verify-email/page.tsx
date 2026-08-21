"use client";

import { Suspense, useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmEmailVerification } from "./actions";
import { AlertCircle, Loader2 } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";

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
        <p className="text-sm text-rose-300">
          Brak tokenu w linku. Otwórz potwierdzenie z wiadomości e-mail lub poproś o nowy link.
        </p>
        <Link
          href="/resend-verification"
          className="text-sm font-semibold text-sky-400 hover:text-sky-300"
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
          <div className="flex items-center gap-3 p-4 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {state.error}
          </div>
        )}
        <p className="text-sm text-neutral-400">
          Kliknij poniżej, aby potwierdzić adres e-mail i aktywować konto.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-black font-bold py-3.5 hover:bg-neutral-200 disabled:opacity-50"
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
    <div className="relative flex items-center justify-center min-h-screen bg-neutral-950 py-12">
      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="relative rounded-[32px] p-px overflow-hidden">
          <SpinBorder className="opacity-30" />
          <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/5">
            <div className="p-8 pb-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white">Potwierdzenie e-mail</h2>
              <p className="text-sm text-neutral-400 mt-1">Ostatni krok aktywacji konta Verris.</p>
            </div>
            <Suspense fallback={<div className="p-8 text-neutral-500 text-sm">Ładowanie…</div>}>
              <VerifyEmailForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

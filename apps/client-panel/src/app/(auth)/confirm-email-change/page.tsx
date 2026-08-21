"use client";

import { Suspense, useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmEmailChange } from "./actions";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";
import { VerrisLockup } from "@/components/logo";

type State = { error?: string };
const initialState: State = {};

function ConfirmForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, action, pending] = useActionState(confirmEmailChange, initialState);
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
          Brak tokenu w linku. Otwórz potwierdzenie z wiadomości e-mail wysłanej na nowy adres.
        </p>
        <Link href="/dashboard/settings" className="text-sm font-semibold text-sky-400 hover:text-sky-300">
          Wróć do ustawień
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
          Kliknij poniżej, aby potwierdzić nowy adres e-mail konta. Po zmianie zaloguj się ponownie.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-black font-bold py-3.5 hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
          {pending ? "Potwierdzanie…" : "Potwierdź nowy adres e-mail"}
        </button>
      </div>
    </form>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 px-4">
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 flex justify-center">
          <VerrisLockup size="lg" layout="vertical" className="items-center" />
        </div>
        <div className="relative overflow-hidden rounded-[32px] p-px shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <SpinBorder className="opacity-30" />
          <div className="relative rounded-[calc(32px-1px)] border border-white/5 bg-neutral-950/80 backdrop-blur-3xl">
            <div className="border-b border-white/5 p-8 pb-6">
              <h1 className="text-xl font-bold text-white">Zmiana adresu e-mail</h1>
            </div>
            <Suspense fallback={<div className="p-8"><Loader2 className="h-6 w-6 animate-spin text-sky-400" /></div>}>
              <ConfirmForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

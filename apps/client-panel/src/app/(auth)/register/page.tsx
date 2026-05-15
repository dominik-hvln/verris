"use client";

import { useActionState } from "react";
import { submitRegister } from "./actions";
import { Loader2, AlertCircle } from "lucide-react";

const initialState = { error: "" };

export default function RegisterPage() {
  // @ts-ignore
  const [state, formAction, isPending] = useActionState(submitRegister, initialState);

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-neutral-950 overflow-hidden py-12">
      {/* Deep Dark Mode Background with Subdued Liquid Glass Effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 w-[300px] h-[300px] rounded-full bg-sky-500/10 blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 w-full max-w-[480px] mx-4 animate-in fade-in slide-in-from-bottom-8 duration-[1500ms]">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-900/80 border border-white/10 mb-6 group overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Verris</h1>
          <p className="text-base text-neutral-400">Utwórz nowe konto</p>
        </div>

        {/* Register Card - Liquid Glass */}
        <div className="relative rounded-[32px] p-px overflow-hidden group/card shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="absolute -inset-full animate-[spin_1.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_75%,#0ea5e9_100%)] opacity-30 group-hover/card:opacity-60 transition-opacity duration-500 pointer-events-none" />
          
          <div className="relative rounded-[calc(32px-1px)] bg-neutral-950/80 backdrop-blur-3xl border border-white/5">
            <div className="p-8 pb-6 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">Rejestracja</h2>
                <p className="text-sm text-neutral-400 mt-1">Załóż konto i zacznij korzystać z hostingu nowej generacji</p>
            </div>

            <form action={formAction}>
              <div className="p-8 space-y-5">
                {state?.error && (
                  <div className="flex items-center gap-3 p-4 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-2 animate-in fade-in zoom-in-95">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    {state.error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="firstName" className="text-sm font-semibold text-neutral-300">Imię</label>
                    <input id="firstName" name="firstName" type="text" placeholder="Jan" required className="w-full rounded-xl border border-white/10 bg-neutral-900/50 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition-all duration-300" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lastName" className="text-sm font-semibold text-neutral-300">Nazwisko</label>
                    <input id="lastName" name="lastName" type="text" placeholder="Kowalski" required className="w-full rounded-xl border border-white/10 bg-neutral-900/50 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition-all duration-300" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-semibold text-neutral-300">Adres E-mail</label>
                  <input id="email" name="email" type="email" placeholder="jan@kowalski.pl" required className="w-full rounded-xl border border-white/10 bg-neutral-900/50 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition-all duration-300" />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-semibold text-neutral-300">Hasło</label>
                  <input id="password" name="password" type="password" required minLength={8} placeholder="Minimum 8 znaków" className="w-full rounded-xl border border-white/10 bg-neutral-900/50 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition-all duration-300" />
                </div>
              </div>

              <div className="p-8 pt-2">
                <button type="submit" disabled={isPending} className="relative w-full group overflow-hidden rounded-xl p-px disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="absolute -inset-full animate-[spin_1.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_70%,#0ea5e9_100%)] opacity-70" />
                  <div className="relative flex items-center justify-center h-12 w-full rounded-[calc(0.75rem-1px)] bg-neutral-950 text-sm font-bold text-white transition-all hover:bg-neutral-900">
                    {isPending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
                        Tworzenie konta...
                      </span>
                    ) : "Zarejestruj się"}
                  </div>
                </button>
              </div>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-neutral-400 mt-8 font-medium">
          Masz już konto?{" "}
          <a href="/login" className="text-white hover:text-sky-400 hover:underline underline-offset-4 transition-colors font-semibold">Zaloguj się</a>
        </p>
      </div>
    </div>
  );
}

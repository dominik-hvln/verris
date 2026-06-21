"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { submitRegister } from "./actions";
import { Loader2, AlertCircle, Check, X } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";
import { VerrisLockup } from "@/components/logo";
import { checkPassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const initialState = { error: "" };

export default function RegisterPage() {
  return (
    <Suspense
      fallback={<RegisterFallback />}
    >
      <RegisterContent />
    </Suspense>
  );
}

function RegisterFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
    </div>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref")?.trim() ?? "";

  // @ts-ignore
  const [state, formAction, isPending] = useActionState(submitRegister, initialState);
  const [password, setPassword] = useState("");
  const pw = checkPassword(password);
  const pwBars = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-400"];

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
          <div className="mb-6 flex justify-center">
            <VerrisLockup size="lg" layout="vertical" showTagline className="items-center" />
          </div>
          <p className="text-base text-neutral-400">Utwórz nowe konto</p>
        </div>

        {/* Register Card - Liquid Glass */}
        <div className="relative rounded-[32px] p-px overflow-hidden group/card shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <SpinBorder className="opacity-30 transition-opacity duration-500 group-hover/card:opacity-60" />
          
          <div className="relative rounded-[calc(32px-1px)] bg-neutral-950/80 backdrop-blur-3xl border border-white/5">
            <div className="p-8 pb-6 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">Rejestracja</h2>
                <p className="text-sm text-neutral-400 mt-1">Załóż konto i zacznij korzystać z hostingu nowej generacji</p>
            </div>

            <form action={formAction}>
              {refFromUrl ? <input type="hidden" name="ref" value={refFromUrl} /> : null}
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
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Minimum ${PASSWORD_MIN_LENGTH} znaków`}
                    className="w-full rounded-xl border border-white/10 bg-neutral-900/50 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition-all duration-300"
                  />
                  {password.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i < pw.score ? pwBars[pw.score] : "bg-white/10"
                            }`}
                          />
                        ))}
                      </div>
                      <ul className="space-y-0.5 text-[11px]">
                        <Req ok={pw.lengthOk}>Co najmniej {PASSWORD_MIN_LENGTH} znaków</Req>
                        <Req ok={pw.classesOk}>3 z 4: mała i wielka litera, cyfra, symbol</Req>
                        <Req ok={pw.notCommon}>Nie jest popularnym hasłem</Req>
                      </ul>
                    </div>
                  ) : null}
                </div>

                {/* RODO Sprint 1 / L-03 — required & optional consents.
                    Keep checkboxes uncontrolled (FormData reads `on` for ticked).
                    Required boxes have `required` so browser validation is the
                    first line of defense; server still re-validates. */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-3 group cursor-pointer">
                    <input
                      type="checkbox"
                      name="acceptTerms"
                      required
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-neutral-900/50 text-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:ring-offset-0 cursor-pointer accent-sky-500"
                    />
                    <span className="text-xs text-neutral-300 leading-relaxed">
                      Akceptuję{" "}
                      <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
                        regulamin świadczenia usług
                      </a>{" "}
                      Verris.{" "}
                      <span className="text-rose-400">*</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 group cursor-pointer">
                    <input
                      type="checkbox"
                      name="acceptPrivacy"
                      required
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-neutral-900/50 text-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:ring-offset-0 cursor-pointer accent-sky-500"
                    />
                    <span className="text-xs text-neutral-300 leading-relaxed">
                      Zapoznałem/am się z{" "}
                      <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
                        polityką prywatności
                      </a>
                      .{" "}
                      <span className="text-rose-400">*</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 group cursor-pointer">
                    <input
                      type="checkbox"
                      name="acceptMarketing"
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-neutral-900/50 text-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:ring-offset-0 cursor-pointer accent-sky-500"
                    />
                    <span className="text-xs text-neutral-400 leading-relaxed">
                      Chcę otrzymywać informacje o nowych funkcjach i ofertach Verris (opcjonalnie).
                    </span>
                  </label>

                  <p className="text-[10px] text-neutral-500 leading-relaxed pt-2">
                    Pola oznaczone <span className="text-rose-400">*</span> są wymagane. Twoja zgoda jest dobrowolna i może być wycofana w każdej chwili w ustawieniach konta.
                  </p>
                </div>
              </div>

              <div className="p-8 pt-2">
                <button type="submit" disabled={isPending} className="relative w-full group overflow-hidden rounded-xl p-px disabled:opacity-50 disabled:cursor-not-allowed">
                  <SpinBorder className="opacity-70" />
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

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-emerald-400" : "text-neutral-500"}`}>
      {ok ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
      {children}
    </li>
  );
}

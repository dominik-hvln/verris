"use client";

import { useActionState, useState, useEffect } from "react";
import { submitLogin, submitTwoFactor } from "./actions";
import { Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";
import { Suspense } from "react";
import { LoginNotices } from "./login-notices";

const initialLoginState = {} as Awaited<ReturnType<typeof submitLogin>>;
const initialTwoFactorState = {} as Awaited<ReturnType<typeof submitTwoFactor>>;

export default function LoginPage() {
  const [loginState, loginAction, loginPending] = useActionState(
    submitLogin,
    initialLoginState,
  );

  if (loginState?.twoFactorRequired && loginState.challengeToken) {
    return (
      <TwoFactorScreen
        challengeToken={loginState.challengeToken}
        email={loginState.email ?? ""}
      />
    );
  }

  return (
    <Shell>
      <div className="p-8 pb-6 border-b border-white/5">
        <h2 className="text-xl font-bold text-white">Witaj z powrotem</h2>
        <p className="text-sm text-neutral-400 mt-1">Zaloguj się do swojego konta</p>
      </div>

      <form action={loginAction}>
        <div className="p-8 space-y-5">
          <Suspense fallback={null}>
            <LoginNotices />
          </Suspense>
          {loginState?.error && (
            <div className="flex items-center gap-3 p-4 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-2 animate-in fade-in zoom-in-95">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {loginState.error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-semibold text-neutral-300">
              Adres E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="jan@kowalski.pl"
              required
              defaultValue={loginState?.email ?? ""}
              className="w-full rounded-xl border border-white/10 bg-[#121212]/50 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/50 transition-all duration-300"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-semibold text-neutral-300">
                Hasło
              </label>
              <a
                href="/forgot-password"
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
              >
                Nie pamiętasz?
              </a>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-white/10 bg-[#121212]/50 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/50 transition-all duration-300"
            />
          </div>
        </div>

        <div className="p-8 pt-2">
          <SubmitButton pending={loginPending} label="Zaloguj się" pendingLabel="Logowanie..." />
        </div>
      </form>
    </Shell>
  );
}

function TwoFactorScreen({
  challengeToken,
  email,
}: {
  challengeToken: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(
    submitTwoFactor,
    initialTwoFactorState,
  );
  const [code, setCode] = useState("");

  // Auto-focus the code input
  useEffect(() => {
    document.getElementById("totp-code")?.focus();
  }, []);

  return (
    <Shell>
      <div className="p-8 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Potwierdź logowanie</h2>
            <p className="text-xs text-neutral-400 mt-0.5">{email}</p>
          </div>
        </div>
        <p className="text-sm text-neutral-400 mt-3 leading-relaxed">
          Wprowadź 6-cyfrowy kod z aplikacji TOTP lub jeden z kodów zapasowych.
        </p>
      </div>

      <form action={action}>
        <input type="hidden" name="challengeToken" value={challengeToken} />
        <div className="p-8 space-y-5">
          {state?.error && (
            <div className="flex items-center gap-3 p-4 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {state.error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="totp-code" className="text-sm font-semibold text-neutral-300">
              Kod TOTP / kod zapasowy
            </label>
            <input
              id="totp-code"
              name="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              placeholder="123 456"
              className="w-full rounded-xl border border-white/10 bg-[#121212]/50 px-4 py-3 text-2xl tracking-widest text-center font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/60 transition-all duration-300"
            />
          </div>
        </div>

        <div className="p-8 pt-2">
          <SubmitButton
            pending={pending}
            label="Zweryfikuj i zaloguj"
            pendingLabel="Weryfikacja..."
          />
        </div>
      </form>
    </Shell>
  );
}

function SubmitButton({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="relative w-full group overflow-hidden rounded-xl p-px disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <SpinBorder className="opacity-70" />
      <div className="relative flex items-center justify-center h-12 w-full rounded-[calc(0.75rem-1px)] bg-[#0a0a0a] text-sm font-bold text-white transition-all hover:bg-[#121212]">
        {pending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
            {pendingLabel}
          </span>
        ) : (
          label
        )}
      </div>
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center min-h-screen bg-[#0a0a0a] overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-white/10 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 w-full max-w-[420px] mx-4 animate-in fade-in slide-in-from-bottom-8 duration-[1500ms]">
        <div className="text-center mb-10">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#121212]/80 border border-white/10 mb-6 group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-sky-400"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            Verris
          </h1>
          <p className="text-base text-neutral-400">Panel zarządzania hostingiem</p>
        </div>

        <div className="relative rounded-[32px] p-px overflow-hidden group/card shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <SpinBorder className="opacity-30 transition-opacity duration-500 group-hover/card:opacity-60" />
          <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/5">
            {children}
          </div>
        </div>

        <p className="text-center text-sm text-neutral-400 mt-8 font-medium">
          Nie masz konta?{" "}
          <a
            href="/register"
            className="text-white hover:text-sky-400 hover:underline underline-offset-4 transition-colors font-semibold"
          >
            Zarejestruj się
          </a>
        </p>
      </div>
    </div>
  );
}

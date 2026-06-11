"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, LifeBuoy, AlertCircle, ShieldCheck } from "lucide-react";
import { StaffPasskeyLoginButton } from "./passkey-login-button";
import {
  staffSubmitLogin,
  staffSubmitTwoFactor,
} from "./actions";

type LoginState = Awaited<ReturnType<typeof staffSubmitLogin>>;
type VerifyState = Awaited<ReturnType<typeof staffSubmitTwoFactor>>;

export default function StaffLoginPage() {
  const [loginState, loginAction, loginPending] = useActionState(
    staffSubmitLogin,
    {} as LoginState,
  );

  if (loginState?.twoFactorRequired && loginState.challengeToken) {
    return (
      <TwoFactorScreen challengeToken={loginState.challengeToken} email={loginState.email ?? ""} />
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[50%] h-[30%] rounded-full bg-cyan-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <form
        action={loginAction}
        className="relative w-full max-w-md rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/10 shadow-2xl p-8 space-y-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 border border-white/10">
            <LifeBuoy className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Verris Support</h1>
            <p className="text-xs text-muted-foreground tracking-widest uppercase">Staff / ADMIN</p>
          </div>
        </div>

        {loginState?.error ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {loginState.error}
          </div>
        ) : null}

        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={loginState?.email ?? ""}
            className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-cyan-500/60 outline-none px-3 py-2 text-sm"
            placeholder="staff@firma.pl"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
            Hasło
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-cyan-500/60 outline-none px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loginPending}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 py-2.5 text-sm font-semibold shadow-[0_0_24px_rgba(6,182,212,0.25)]"
        >
          {loginPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loginPending ? "Logowanie…" : "Zaloguj"}
        </button>

        <p className="text-center text-[11px] text-muted-foreground">
          Sesja 8 godzin (httpOnly). Przy włączonym 2FA dostaniesz krok kodu jak w panelu klienta.
        </p>
      </form>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-neutral-500">lub</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <StaffPasskeyLoginButton />
      </div>
    </main>
  );
}

function TwoFactorScreen({
  challengeToken,
  email,
}: {
  challengeToken: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(staffSubmitTwoFactor, {} as VerifyState);
  const [code, setCode] = useState("");

  useEffect(() => {
    document.getElementById("staff-totp-code")?.focus();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[50%] h-[30%] rounded-full bg-cyan-600/10 blur-[120px]" />
      </div>

      <form
        action={action}
        className="relative w-full max-w-md rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/10 shadow-2xl p-8 space-y-6"
      >
        <input type="hidden" name="challengeToken" value={challengeToken} />
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Krok 2: kod aplikacji</h2>
            <p className="text-xs text-neutral-400 mt-1 truncate">Konto: {email}</p>
          </div>
        </div>

        {state?.error ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {state.error}
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="staff-totp-code" className="text-xs font-semibold text-neutral-300">
            Kod TOTP lub kod odzyskiwania
          </label>
          <input
            id="staff-totp-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-cyan-500/60 outline-none px-3 py-2 text-sm font-mono tracking-widest"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-2.5 text-sm font-semibold"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Weryfikacja…" : "Potwierdź i zaloguj"}
        </button>
      </form>
    </main>
  );
}

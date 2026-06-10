"use client";

import { useActionState, useState, useEffect } from "react";
import { submitLogin, submitTwoFactor } from "./actions";
import { Loader2, AlertCircle, ShieldCheck, Mail } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";
import { Suspense } from "react";
import { LoginNotices } from "./login-notices";
import { VerrisLockup } from "@/components/logo";
import { VerrisPatternLayer } from "@/components/brand/brand-pattern";

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
      <div className="border-b border-border p-8 pb-6">
        <h2 className="font-display text-xl font-bold text-foreground">Witaj z powrotem</h2>
        <p className="mt-1 text-sm text-muted-foreground">Zaloguj się do panelu Verris.</p>
      </div>

      <form action={loginAction}>
        <div className="space-y-5 p-8">
          <Suspense fallback={null}>
            <LoginNotices />
          </Suspense>
          {loginState?.error && (
            <div className="mb-2 animate-in space-y-2 fade-in zoom-in-95">
              {loginState.emailUnverified ? (
                <div className="flex items-start gap-3 rounded-xl border border-verris-mid/30 bg-verris-green/10 p-4 text-sm text-foreground">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div className="space-y-2">
                    <p>{loginState.error}</p>
                    {loginState.email ? (
                      <a
                        href={`/resend-verification?email=${encodeURIComponent(loginState.email)}`}
                        className="inline-block text-xs font-semibold text-accent underline-offset-2 hover:text-verris-tip hover:underline"
                      >
                        Wyślij link potwierdzający ponownie
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  {loginState.error}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-semibold text-verris-body">
              Adres E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="jan@kowalski.pl"
              required
              defaultValue={loginState?.email ?? ""}
              className="w-full rounded-xl border border-border bg-verris-pine/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-semibold text-verris-body">
                Hasło
              </label>
              <a
                href="/forgot-password"
                className="text-xs font-semibold text-accent transition-colors hover:text-verris-tip"
              >
                Nie pamiętasz?
              </a>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-border bg-verris-pine/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
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

  useEffect(() => {
    document.getElementById("totp-code")?.focus();
  }, []);

  return (
    <Shell>
      <div className="border-b border-border p-8 pb-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-verris-mid/40 bg-eko-bg text-accent">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Potwierdź logowanie</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Wprowadź 6-cyfrowy kod z aplikacji TOTP lub jeden z kodów zapasowych.
        </p>
      </div>

      <form action={action}>
        <input type="hidden" name="challengeToken" value={challengeToken} />
        <div className="space-y-5 p-8">
          {state?.error && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {state.error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="totp-code" className="text-sm font-semibold text-verris-body">
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
              className="w-full rounded-xl border border-border bg-verris-pine/40 px-4 py-3 text-center font-mono text-2xl tracking-widest text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
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
      className="group relative w-full overflow-hidden rounded-xl p-px disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SpinBorder className="opacity-70" />
      <div className="relative flex h-12 w-full items-center justify-center rounded-[calc(0.75rem-1px)] bg-primary text-sm font-bold text-primary-foreground transition-all hover:bg-verris-tip">
        {pending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <VerrisPatternLayer opacity={0.07} />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-verris-mint/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-verris-green/10 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-4 w-full max-w-[420px] animate-in duration-[1500ms] fade-in slide-in-from-bottom-8">
        <div className="mb-10 flex justify-center">
          <VerrisLockup size="lg" layout="vertical" showTagline className="items-center" />
        </div>

        <div className="group/card relative overflow-hidden rounded-[32px] p-px shadow-[0_0_50px_rgba(0,0,0,0.35)]">
          <SpinBorder className="opacity-30 transition-opacity duration-500 group-hover/card:opacity-60" />
          <div className="relative rounded-[calc(32px-1px)] border border-border bg-card/95 backdrop-blur-3xl">
            {children}
          </div>
        </div>

        <p className="mt-8 text-center text-sm font-medium text-muted-foreground">
          Nie masz konta?{" "}
          <a
            href="/register"
            className="font-semibold text-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            Zarejestruj się
          </a>
        </p>
      </div>
    </div>
  );
}

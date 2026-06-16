"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Loader2, KeyRound } from "lucide-react";
import { adminLogin, adminBreakGlassLogin } from "@/lib/auth-actions";
import { AdminPasskeyLoginButton } from "./passkey-login-button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [breakGlass, setBreakGlass] = useState(false);
  const [bgCode, setBgCode] = useState("");
  const [bgRecovery, setBgRecovery] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (breakGlass) {
        const res = await adminBreakGlassLogin({
          email,
          password,
          code: bgCode,
          breakGlassCode: bgRecovery,
        });
        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        router.replace("/settings/security");
        router.refresh();
        return;
      }
      const result = await adminLogin(email, password);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.replace(
        "passkeyEnrollmentRequired" in result && result.passkeyEnrollmentRequired
          ? "/settings/security?enroll=1"
          : "/",
      );
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0B0D17] text-white px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[50%] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-md rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/10 shadow-2xl p-8 space-y-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Verris Core</h1>
            <p className="text-xs text-muted-foreground tracking-widest uppercase">
              Centrala Dowodzenia
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            Email administratora
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-indigo-400 focus:bg-white/[0.07] outline-none px-3 py-2 text-sm placeholder:text-muted-foreground transition-colors"
            placeholder="admin@verris.pl"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
            Hasło
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-indigo-400 focus:bg-white/[0.07] outline-none px-3 py-2 text-sm placeholder:text-muted-foreground transition-colors"
            placeholder="••••••••"
          />
        </div>

        {breakGlass && (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Logowanie awaryjne — gdy nie masz dostępu do passkey. Wymaga kodu 2FA oraz
              jednorazowego kodu break-glass. Każde użycie powiadamia wszystkich adminów.
            </p>
            <div className="space-y-1">
              <label htmlFor="bgCode" className="text-xs font-medium text-muted-foreground">
                Kod 2FA (TOTP lub recovery)
              </label>
              <input
                id="bgCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={bgCode}
                onChange={(e) => setBgCode(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-amber-400 outline-none px-3 py-2 text-sm"
                placeholder="123456"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="bgRecovery" className="text-xs font-medium text-muted-foreground">
                Kod awaryjny (break-glass)
              </label>
              <input
                id="bgRecovery"
                value={bgRecovery}
                onChange={(e) => setBgRecovery(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-amber-400 outline-none px-3 py-2 text-sm font-mono"
                placeholder="xxxxx-xxxxx"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors py-2.5 text-sm font-medium shadow-[0_0_20px_rgba(99,102,241,0.35)]"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending
            ? "Logowanie..."
            : breakGlass
            ? "Zaloguj awaryjnie"
            : "Zaloguj do strefy ROOT"}
        </button>

        <button
          type="button"
          onClick={() => {
            setBreakGlass((v) => !v);
            setError(null);
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-amber-300 transition-colors"
        >
          <KeyRound className="h-3 w-3" />
          {breakGlass ? "Wróć do standardowego logowania" : "Nie mam dostępu do passkey (break-glass)"}
        </button>

        <p className="text-center text-[11px] text-muted-foreground">
          Sesja administratora wygasa po 8 godzinach bezczynności.
        </p>
      </form>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-neutral-500">lub</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <AdminPasskeyLoginButton />
      </div>
    </main>
  );
}

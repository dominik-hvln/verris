"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { submitRegister } from "./actions";
import { Loader2, AlertCircle, Check, X } from "lucide-react";
import { RegionBledu } from "@/components/region-bledu";
import { SpinBorder } from "@/components/spin-border";
import { Captcha } from "@/components/captcha";
import { checkPassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { Checkbox } from '@/components/panel/checkbox';
import { AUTH_BLAD, AUTH_ETYKIETA, AUTH_INPUT, AUTH_LINK, AuthShell } from "@/components/auth-shell";

const initialState = { error: "" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterFallback />}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 aria-hidden className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

// Siła hasła: czerwony → bursztynowy → zielony marki (tokeny działają w obu motywach).
const PASKI = ["bg-destructive", "bg-destructive", "bg-amber-500", "bg-accent", "bg-accent"];

// 14.10 (Dominik): wygląd jak ekran logowania — wspólna AuthShell, kolory z tokenów panelu zamiast
// starej palety (neutral-950, sky-*), która nie pasowała do reszty i nie działała w jasnym motywie.
function RegisterContent() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref")?.trim() ?? "";

  const [state, formAction, isPending] = useActionState(submitRegister, initialState);
  const [password, setPassword] = useState("");
  const pw = checkPassword(password);
  const blad = !isPending && state?.error ? state.error : null;

  return (
    <AuthShell
      szeroka
      haslo
      stopka={
        <>
          Masz już konto?{" "}
          <a href="/login" className="font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-accent">
            Zaloguj się
          </a>
        </>
      }
    >
      <div className="border-b border-border p-8 pb-6">
        <h1 className="font-display text-xl font-bold text-foreground">Załóż konto</h1>
        <p className="mt-1 text-sm text-muted-foreground">Po rejestracji potwierdzisz adres e-mail i od razu zamówisz usługę.</p>
      </div>

      <form action={formAction}>
        {refFromUrl ? <input type="hidden" name="ref" value={refFromUrl} /> : null}
        <div className="space-y-5 p-8">
          <RegionBledu id="rejestracja-blad">
            {blad ? (
              <div className={`${AUTH_BLAD} mb-2 animate-in fade-in zoom-in-95`}>
                <AlertCircle aria-hidden className="h-5 w-5 shrink-0" />
                {blad}
              </div>
            ) : null}
          </RegionBledu>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="firstName" className={AUTH_ETYKIETA}>Imię</label>
              <input id="firstName" name="firstName" type="text" autoComplete="given-name" placeholder="Jan" required className={AUTH_INPUT} />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastName" className={AUTH_ETYKIETA}>Nazwisko</label>
              <input id="lastName" name="lastName" type="text" autoComplete="family-name" placeholder="Kowalski" required className={AUTH_INPUT} />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className={AUTH_ETYKIETA}>Adres e-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="jan@kowalski.pl"
              required
              aria-invalid={blad ? true : undefined}
              aria-describedby={blad ? "rejestracja-blad" : undefined}
              className={AUTH_INPUT}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className={AUTH_ETYKIETA}>Hasło</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Minimum ${PASSWORD_MIN_LENGTH} znaków`}
              aria-describedby="haslo-wymagania"
              className={AUTH_INPUT}
            />
            {password.length > 0 ? (
              <div id="haslo-wymagania" className="space-y-1.5 pt-1">
                <div className="flex gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < pw.score ? PASKI[pw.score] : "bg-border"}`} />
                  ))}
                </div>
                <ul className="space-y-0.5 text-[11px]">
                  <Req ok={pw.lengthOk}>Co najmniej {PASSWORD_MIN_LENGTH} znaków</Req>
                  <Req ok={pw.classesOk}>3 z 4: mała i wielka litera, cyfra, symbol</Req>
                  <Req ok={pw.notCommon}>Nie jest popularnym hasłem</Req>
                </ul>
              </div>
            ) : (
              <span id="haslo-wymagania" className="sr-only">Co najmniej {PASSWORD_MIN_LENGTH} znaków.</span>
            )}
          </div>

          {/* RODO Sprint 1 / L-03 — zgody wymagane i opcjonalne. Pola niekontrolowane (FormData czyta `on`);
              wymagane mają `required` (pierwsza linia walidacji), serwer i tak sprawdza ponownie. */}
          <div className="space-y-3 pt-2">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox name="acceptTerms" required className="mt-0.5" />
              <span className="text-xs leading-relaxed text-verris-body">
                Akceptuję{" "}
                <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className={`${AUTH_LINK} underline underline-offset-2`}>
                  regulamin świadczenia usług
                </a>{" "}
                Verris. <span className="text-destructive">*</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox name="acceptPrivacy" required className="mt-0.5" />
              <span className="text-xs leading-relaxed text-verris-body">
                Zapoznałem/am się z{" "}
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className={`${AUTH_LINK} underline underline-offset-2`}>
                  polityką prywatności
                </a>
                . <span className="text-destructive">*</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox name="acceptMarketing" className="mt-0.5" />
              <span className="text-xs leading-relaxed text-muted-foreground">
                Chcę otrzymywać informacje o nowych funkcjach i ofertach Verris (opcjonalnie).
              </span>
            </label>

            <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
              Pola oznaczone <span className="text-destructive">*</span> są wymagane. Zgodę marketingową wycofasz w każdej chwili w ustawieniach konta.
            </p>
          </div>
        </div>

        <div className="p-8 pt-2">
          <div className="mb-4"><Captcha action="register" /></div>
          <button
            type="submit"
            disabled={isPending}
            className="group relative w-full overflow-hidden rounded-xl p-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SpinBorder className="opacity-70" />
            <div className="relative flex h-12 w-full items-center justify-center rounded-[calc(0.75rem-1px)] bg-primary text-sm font-bold text-primary-foreground transition-all hover:bg-verris-tip">
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 aria-hidden className="h-5 w-5 animate-spin text-primary-foreground" />
                  Tworzenie konta…
                </span>
              ) : (
                "Zarejestruj się"
              )}
            </div>
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-accent" : "text-muted-foreground"}`}>
      {ok ? <Check aria-hidden className="h-3 w-3 shrink-0" /> : <X aria-hidden className="h-3 w-3 shrink-0" />}
      {children}
    </li>
  );
}

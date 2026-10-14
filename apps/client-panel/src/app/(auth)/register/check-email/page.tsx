"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Mail } from "lucide-react";
import { trackSignUp, pushUserData } from "@/lib/analytics-events";
import { AUTH_INFO, AUTH_LINK, AuthShell } from "@/components/auth-shell";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim();

  // Konwersja sign_up — ta strona renderuje się wyłącznie po udanej rejestracji.
  // Ta strona jest POZA layoutem dashboardu, więc user_data trzeba ustawić lokalnie,
  // z e-maila w URL, ZANIM odpali się sign_up (kolejność ma znaczenie: tag konwersji
  // odczytuje user_data w momencie zdarzenia). pushUserData sam sprawdza zgodę marketingową.
  useEffect(() => {
    const run = async () => {
      if (email) await pushUserData(email);
      trackSignUp();
    };
    void run();
  }, [email]);

  return (
    <div className="p-8 space-y-5">
      <div className={AUTH_INFO}>
        <Mail aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="space-y-2">
          <p>
            Wysłaliśmy link potwierdzający{email ? (
              <>
                {" "}
                na <span className="font-mono text-foreground">{email}</span>
              </>
            ) : (
              " na Twój adres e-mail"
            )}
            . Kliknij go, aby aktywować konto, a następnie zaloguj się hasłem z rejestracji.
          </p>
          <p className="text-xs text-muted-foreground">Sprawdź folder spam, jeśli wiadomość nie dotrze w kilka minut.</p>
        </div>
      </div>
      <Link
        href={email ? `/resend-verification?email=${encodeURIComponent(email)}` : "/resend-verification"}
        className={`block text-center text-sm ${AUTH_LINK}`}
      >
        Wyślij link ponownie
      </Link>
      <Link
        href="/login"
        className="block text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Przejdź do logowania
      </Link>
    </div>
  );
}

export default function RegisterCheckEmailPage() {
  return (
    <AuthShell haslo>
      <div className="border-b border-border p-8 pb-6">
        <h1 className="font-display text-xl font-bold text-foreground">Sprawdź skrzynkę</h1>
        <p className="mt-1 text-sm text-muted-foreground">Potwierdź e-mail, aby zalogować się do panelu.</p>
      </div>
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Ładowanie…</div>}>
        <CheckEmailContent />
      </Suspense>
    </AuthShell>
  );
}

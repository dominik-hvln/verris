"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Mail } from "lucide-react";
import { SpinBorder } from "@/components/spin-border";
import { trackSignUp } from "@/lib/analytics-events";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim();

  // Konwersja sign_up — ta strona renderuje się wyłącznie po udanej rejestracji.
  useEffect(() => {
    trackSignUp();
  }, []);

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-start gap-3 p-4 text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
        <Mail className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p>
            Wysłaliśmy link potwierdzający{email ? (
              <>
                {" "}
                na <span className="font-mono text-emerald-100">{email}</span>
              </>
            ) : (
              " na Twój adres e-mail"
            )}
            . Kliknij go, aby aktywować konto, a następnie zaloguj się hasłem z rejestracji.
          </p>
          <p className="text-emerald-300/80 text-xs">Sprawdź folder spam, jeśli wiadomość nie dotrze w kilka minut.</p>
        </div>
      </div>
      <Link
        href={email ? `/resend-verification?email=${encodeURIComponent(email)}` : "/resend-verification"}
        className="block text-center text-sm font-semibold text-sky-400 hover:text-sky-300"
      >
        Wyślij link ponownie
      </Link>
      <Link
        href="/login"
        className="block text-center text-sm text-neutral-400 hover:text-neutral-300"
      >
        Przejdź do logowania
      </Link>
    </div>
  );
}

export default function RegisterCheckEmailPage() {
  return (
    <div className="relative flex items-center justify-center min-h-screen bg-neutral-950 py-12">
      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="relative rounded-[32px] p-px overflow-hidden">
          <SpinBorder className="opacity-30" />
          <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/5">
            <div className="p-8 pb-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white">Sprawdź skrzynkę</h2>
              <p className="text-sm text-neutral-400 mt-1">Potwierdź e-mail, aby zalogować się do panelu.</p>
            </div>
            <Suspense fallback={<div className="p-8 text-neutral-500 text-sm">Ładowanie…</div>}>
              <CheckEmailContent />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

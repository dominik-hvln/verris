"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { potwierdz } from "@/components/potwierdz";
import { plForm } from "@/lib/pl";
import { ustawWymog2faAction, type StanWymogu2fa } from "./actions";

/**
 * D10 (10.10) — przełącznik „Wymuś 2FA dla zespołu” (tylko administrator, zmiana w dzienniku). Gdy wymóg włącza
 * REQUIRE_2FA_FOR_STAFF w konfiguracji serwera, przełącznik jest nieaktywny — panel go nie wyłączy.
 */
export function Wymog2fa({ start, bez2fa }: { start: StanWymogu2fa; bez2fa: number }) {
  const [stan, setStan] = useState(start);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const przelacz = async () => {
    setBlad(null);
    const wlacz = !stan.wlaczony;
    const ok = await potwierdz(
      wlacz
        ? `Operatorzy bez 2FA nie zalogują się hasłem, dopóki nie włączą TOTP (passkey działa dalej).${bez2fa ? ` Na tej liście bez TOTP: ${bez2fa} ${plForm(bez2fa, "osoba", "osoby", "osób")}.` : ""}`
        : "Operatorzy znów zalogują się samym hasłem.",
      { tytul: wlacz ? "Wymusić 2FA dla zespołu?" : "Wyłączyć wymóg 2FA?", akcja: wlacz ? "Wymuś 2FA" : "Wyłącz", niebezpieczne: !wlacz },
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await ustawWymog2faAction(wlacz);
      if (r.ok) setStan(r.stan);
      else setBlad(r.error);
    });
  };

  return (
    <section data-wymog-2fa={stan.obowiazuje ? "obowiazuje" : "nie"} className="rounded-2xl border border-white/10 bg-black/35 p-5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            {stan.obowiazuje ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-amber-400" />}
            Wymuś 2FA dla zespołu
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {stan.wymuszonyEnv
              ? "Włączone w konfiguracji serwera (REQUIRE_2FA_FOR_STAFF) — panel go nie wyłączy."
              : stan.wlaczony
                ? "Włączone: logowanie hasłem wymaga TOTP."
                : "Wyłączone: operator bez 2FA loguje się samym hasłem."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={stan.obowiazuje}
          onClick={przelacz}
          disabled={pending || stan.wymuszonyEnv}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {stan.obowiazuje ? "Włączone" : "Wyłączone"}
        </button>
      </div>
      {blad ? <p className="text-xs text-rose-300">{blad}</p> : null}
    </section>
  );
}

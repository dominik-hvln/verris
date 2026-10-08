"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { Checkbox } from "@/components/checkbox";
import { ustawBlokadeAction } from "./operacje-actions";

/**
 * PB-46 — blokada logowania klienta z panelu obsługi (CUSTOMERS_MANAGE; decyzja 2026-08-21: spamera trzeba
 * zatrzymać od razu, bez czekania na administratora). Wysyła wyłącznie pola blokady — notatki nie rusza.
 */
export function BlokadaLogowania({ userId, zablokowane, powod }: { userId: string; zablokowane: boolean; powod: string | null }) {
  const router = useRouter();
  const [blokada, setBlokada] = useState(zablokowane);
  const [tekst, setTekst] = useState(powod ?? "");
  const [blad, setBlad] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  const zapisz = () => {
    setBlad(null);
    setOk(false);
    start(async () => {
      const r = await ustawBlokadeAction(userId, blokada, tekst);
      if (!r.ok) {
        setBlad(r.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  };

  return (
    <section id="blokada" data-karta="blokada" className="scroll-mt-24 space-y-4 rounded-2xl border border-white/10 bg-black/30 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-white">Blokada logowania</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Zablokowany klient nie zaloguje się ani hasłem, ani po 2FA. Wejście na konto klienta z panelu nadal działa. Zmiana trafia do dziennika.
      </p>
      <label className="flex cursor-pointer items-center gap-3">
        <Checkbox checked={blokada} disabled={pending} onChange={(e) => setBlokada(e.target.checked)} />
        <span className="text-sm text-white">Logowanie zablokowane</span>
      </label>
      {blokada ? (
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Powód blokady (widzi zespół)</span>
          <textarea
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            disabled={pending}
            rows={2}
            maxLength={2000}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
      ) : null}
      {blad ? <p className="text-sm text-rose-300">{blad}</p> : null}
      {ok ? <p className="text-sm text-emerald-300">Zapisano.</p> : null}
      <button
        type="button"
        onClick={zapisz}
        disabled={pending || (blokada === zablokowane && (!blokada || tekst === (powod ?? "")))}
        className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Zapisz
      </button>
    </section>
  );
}

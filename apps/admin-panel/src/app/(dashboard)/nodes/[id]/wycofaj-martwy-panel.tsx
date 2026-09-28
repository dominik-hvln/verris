"use client";

import { useState, useTransition } from "react";
import { Loader2, Skull } from "lucide-react";
import { wycofajMartwyWezelAction } from "../actions";

/**
 * Węzeł skasowany u dostawcy: zwykłe wycofanie przenosi konta, a tu nie ma skąd. Konta → usunięte,
 * subskrypcje → anulowane, NS/hostname zwolnione w OVH (IP może dostać ktoś inny). Potwierdzenie nazwą.
 */
export function WycofajMartwyPanel({ serverId, nazwa, konta, martwy }: { serverId: string; nazwa: string; konta: number; martwy: boolean }) {
  const [tekst, setTekst] = useState("");
  const [wynik, setWynik] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="space-y-3 rounded-2xl border border-rose-500/30 bg-rose-500/[0.04] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-200"><Skull className="h-4 w-4" /> Serwera już nie ma — wycofaj węzeł z panelu</h2>
      <p className="text-xs text-muted-foreground">
        Dla węzła skasowanego u dostawcy. Konta na nim ({konta}) zostaną oznaczone jako usunięte, ich subskrypcje anulowane,
        węzeł zniknie z puli, a jego nazwy NS i hostname zostaną usunięte z DNS w OVH — IP może trafić do kogoś innego.
        Danych kont nie da się już odzyskać z tego serwera. Aktywne płatności w Stripe trzeba najpierw anulować.
      </p>
      {!martwy ? (
        <p className="text-sm text-amber-200">Węzeł wysyłał sygnał w ostatnim tygodniu — żyje. Użyj wycofania z przeniesieniem kont.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={`wpisz: ${nazwa}`} className="form-input max-w-xs" />
          <button
            type="button"
            disabled={pending || tekst.trim() !== nazwa}
            onClick={() =>
              start(async () => {
                setBlad(null);
                const r = await wycofajMartwyWezelAction(serverId, tekst.trim());
                if ("error" in r && r.error) return setBlad(r.error);
                const d = r.data!;
                setWynik(`Wycofano. Usunięte konta: ${d.usunieteKonta.join(", ") || "brak"}. DNS: ${d.dns.map((x) => `${x.step} — ${x.status}`).join("; ") || "bez zmian"}.`);
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Wycofaj węzeł na stałe
          </button>
        </div>
      )}
      {wynik ? <p className="text-sm text-emerald-300" role="status">{wynik}</p> : null}
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { zakolejkujKsefZalegle, type KsefZalegle } from "./actions";

const ENV_NAZWA: Record<string, string> = { test: "TEST", demo: "DEMO", prod: "PRODUKCYJNE" };

/**
 * Przegląd 15.10 — faktury VAT panelu wystawione przed oknem automatu (7 dni), których nie ma w kolejce KSeF
 * (np. KSeF był wyłączony dłużej niż tydzień). Kolejkowanie świadome: dwa kliknięcia, środowisko na przycisku,
 * liczba z podglądu sprawdzana przez API.
 */
export function KsefZalegleSekcja({ zalegle, env, enabled, onDone }: { zalegle: KsefZalegle; env: string; enabled: boolean; onDone: () => void }) {
  const [potwierdzenie, setPotwierdzenie] = useState(false);
  const [wynik, setWynik] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (zalegle.liczba === 0) return null;
  const srodowisko = ENV_NAZWA[env] ?? env;

  const zakolejkuj = () =>
    startTransition(async () => {
      setBlad(null);
      const r = await zakolejkujKsefZalegle(zalegle.liczba);
      if ("error" in r && r.error) setBlad(r.error);
      else if ("data" in r && r.data) {
        setWynik(`Zakolejkowano ${r.data.zakolejkowane} — pójdą w najbliższym cyklu (co 10 min).`);
        onDone();
      }
      setPotwierdzenie(false);
    });

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" /> Faktury VAT poza KSeF: {zalegle.liczba}
      </p>
      <p className="text-amber-100/80">
        Wystawione w panelu ponad 7 dni temu i nigdy niezakolejkowane do KSeF (np. wysyłka była wyłączona). Automat ich nie
        dośle — sprawdź listę i zakolejkuj albo wyjaśnij z księgową.
      </p>
      <ul className="space-y-0.5">
        {zalegle.przyklady.map((f) => (
          <li key={f.id}>
            <Link href={`/invoices/${f.id}#ksef`} className="underline decoration-dotted">
              {f.number}
            </Link>
            {f.issuedAt ? ` — ${new Date(f.issuedAt).toLocaleDateString("pl-PL")}` : ""}
          </li>
        ))}
        {zalegle.liczba > zalegle.przyklady.length && <li>…i {zalegle.liczba - zalegle.przyklady.length} więcej</li>}
      </ul>
      {!enabled ? (
        <p>Najpierw włącz wysyłkę do KSeF powyżej.</p>
      ) : potwierdzenie ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Wysłać {zalegle.liczba} do KSeF {srodowisko}? Z KSeF PROD faktur nie da się usunąć.
          </span>
          <button type="button" disabled={isPending} onClick={zakolejkuj} className="rounded border border-amber-400/50 px-2 py-0.5 hover:bg-amber-500/20">
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : `Tak, zakolejkuj (${srodowisko})`}
          </button>
          <button type="button" onClick={() => setPotwierdzenie(false)} className="rounded border border-white/15 px-2 py-0.5 hover:bg-white/5">
            Anuluj
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setPotwierdzenie(true)} className="rounded border border-amber-400/50 px-2 py-0.5 hover:bg-amber-500/20">
          Zakolejkuj do KSeF {srodowisko}…
        </button>
      )}
      {wynik && <p className="text-emerald-200">{wynik}</p>}
      {blad && <p className="text-rose-200">{blad}</p>}
    </div>
  );
}

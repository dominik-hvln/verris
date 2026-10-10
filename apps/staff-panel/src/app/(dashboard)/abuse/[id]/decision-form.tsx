"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decyzjaAction } from "../actions";
import { Checkbox } from '@/components/checkbox';

/** F2.3 — dopasowana usługa; `mozeZawiesic` — operator ma SUBSCRIPTIONS_SUSPEND (API sprawdza to samo). */
export interface UslugaZgloszenia {
  domena: string | null;
  status: string;
}

export function DecisionForm({
  id,
  maKlienta,
  usluga = null,
  mozeZawiesic = false,
}: {
  id: string;
  maKlienta: boolean;
  usluga?: UslugaZgloszenia | null;
  mozeZawiesic?: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState("");
  const [notify, setNotify] = useState(true);
  const [zawies, setZawies] = useState(false);
  const [potwierdzenie, setPotwierdzenie] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dzialajaca = !!usluga && !["SUSPENDED", "CANCELED", "EXPIRED"].includes(usluga.status);
  const nazwa = usluga?.domena ?? "usługę";
  const run = (status: "IN_REVIEW" | "ACTION_TAKEN" | "REJECTED") => {
    const zawiesTeraz = status === "ACTION_TAKEN" && zawies && dzialajaca && mozeZawiesic;
    // Zawieszenie odcina stronę i pocztę klienta — drugi krok z opisem skutków przed wysłaniem.
    if (zawiesTeraz && !potwierdzenie) {
      setPotwierdzenie(true);
      return;
    }
    setPotwierdzenie(false);
    start(async () => {
      const r = await decyzjaAction({ id, status, decision, notifyCustomer: status === "ACTION_TAKEN" && notify, suspendService: zawiesTeraz });
      if ("error" in r) return setMsg(r.error);
      setMsg(zawiesTeraz ? "Zapisano. Usługa zawieszona." : "Zapisano.");
      router.refresh();
    });
  };
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
      <h2 className="text-sm font-semibold text-white">Decyzja</h2>
      <p className="text-xs text-muted-foreground">
        „Podjęto działania” może od razu zawiesić dopasowaną usługę albo tylko powiadomić klienta. Kordon wysyłki i usunięcie pliku robisz w panelu operatora lub na węźle.
      </p>
      <textarea aria-label="Uzasadnienie decyzji" value={decision} onChange={(e) => setDecision(e.target.value)} rows={5}
        placeholder="Uzasadnienie (min. 20 znaków): co sprawdzono, co zrobiono i na jakiej podstawie. Dostanie je zgłaszający."
        className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white" />
      {maKlienta ? (
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Przy „Podjęto działania” wyślij klientowi uzasadnienie (DSA art. 17)
        </label>
      ) : null}
      {usluga && !dzialajaca ? (
        <p className="text-xs text-muted-foreground" data-usluga="niedzialajaca">
          Usługa {nazwa} jest już {usluga.status === "SUSPENDED" ? "zawieszona" : "zakończona"}.
        </p>
      ) : null}
      {dzialajaca && mozeZawiesic ? (
        <label className="flex items-center gap-2 text-xs text-neutral-300" data-zawies="opcja">
          <Checkbox checked={zawies} onChange={(e) => { setZawies(e.target.checked); setPotwierdzenie(false); }} />
          Przy „Podjęto działania” zawieś usługę {nazwa}
        </label>
      ) : null}
      {dzialajaca && !mozeZawiesic ? (
        <p className="text-xs text-muted-foreground" data-zawies="brak-uprawnien">
          Zawieszenie usługi {nazwa} wymaga uprawnienia SUBSCRIPTIONS_SUSPEND — wyślij wniosek z karty usługi w panelu operatora.
        </p>
      ) : null}
      {potwierdzenie ? (
        <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3" data-zawies="potwierdzenie">
          <p className="text-xs text-rose-100">
            Zawiesić {nazwa}? Strona, poczta (odbiór i wysyłka) i FTP klienta przestaną działać do odwieszenia. Wpis trafi do dziennika klienta jako działanie obsługi Verris.
          </p>
          <div className="flex flex-wrap gap-2">
            <button disabled={pending} onClick={() => run("ACTION_TAKEN")} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">Zawieś i zapisz decyzję</button>
            <button disabled={pending} onClick={() => setPotwierdzenie(false)} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50">Anuluj</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => run("IN_REVIEW")} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50">Biorę do sprawdzenia</button>
          <button disabled={pending} onClick={() => run("ACTION_TAKEN")} className="rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50">Podjęto działania</button>
          <button disabled={pending} onClick={() => run("REJECTED")} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50">Odrzuć (bez podstaw)</button>
        </div>
      )}
      {msg ? <p className="text-xs text-neutral-300">{msg}</p> : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decyzjaAction } from "../actions";
import { Checkbox } from '@/components/checkbox';
import { domenaDoWyswietlenia } from "@verris/contracts";

/**
 * F2.3 — dopasowana usługa; `mozeZawiesic` — operator ma SUBSCRIPTIONS_SUSPEND, `mozeBlokowac` (F3.1) — MAIL_SEND_BLOCK
 * (API sprawdza to samo).
 */
export interface UslugaZgloszenia {
  domena: string | null;
  status: string;
  /** Audyt Fal 2 — zawieszona za brak płatności albo przez partnera: zawieszenie za nadużycie można dopisać. */
  zawieszonaBezDecyzjiObslugi?: boolean;
}

export function DecisionForm({
  id,
  maKlienta,
  usluga = null,
  mozeZawiesic = false,
  mozeBlokowac = false,
}: {
  id: string;
  maKlienta: boolean;
  usluga?: UslugaZgloszenia | null;
  mozeZawiesic?: boolean;
  mozeBlokowac?: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState("");
  const [notify, setNotify] = useState(true);
  const [zawies, setZawies] = useState(false);
  const [blokuj, setBlokuj] = useState(false);
  const [potwierdzenie, setPotwierdzenie] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dzialajaca = !!usluga && !["SUSPENDED", "CANCELED", "EXPIRED"].includes(usluga.status);
  // Zawieszona za brak płatności (albo przez partnera) wróciłaby sama po wpłacie — nadużycie trzeba dopisać.
  const doDopisania = !!usluga && usluga.status === "SUSPENDED" && usluga.zawieszonaBezDecyzjiObslugi === true;
  const doZawieszenia = dzialajaca || doDopisania;
  const nazwa = domenaDoWyswietlenia(usluga?.domena) ?? "usługę";
  const run = (status: "IN_REVIEW" | "ACTION_TAKEN" | "REJECTED") => {
    const zawiesTeraz = status === "ACTION_TAKEN" && zawies && doZawieszenia && mozeZawiesic;
    const blokujTeraz = status === "ACTION_TAKEN" && blokuj && dzialajaca && mozeBlokowac;
    // Zawieszenie odcina stronę i pocztę klienta — drugi krok z opisem skutków przed wysłaniem.
    if (zawiesTeraz && !potwierdzenie) {
      setPotwierdzenie(true);
      return;
    }
    setPotwierdzenie(false);
    start(async () => {
      const r = await decyzjaAction({ id, status, decision, notifyCustomer: status === "ACTION_TAKEN" && notify, suspendService: zawiesTeraz, blockSending: blokujTeraz });
      if ("error" in r) return setMsg(r.error);
      setMsg(["Zapisano.", blokujTeraz ? "Wysyłka poczty usługi zablokowana." : "", zawiesTeraz ? "Usługa zawieszona." : ""].filter(Boolean).join(" "));
      router.refresh();
    });
  };
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
      <h2 className="text-sm font-semibold text-white">Decyzja</h2>
      <p className="text-xs text-muted-foreground">
        „Podjęto działania” może od razu zablokować wysyłkę poczty dopasowanej usługi, zawiesić ją albo tylko powiadomić klienta. Usunięcie pliku robisz w panelu operatora lub na węźle.
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
          Usługa {nazwa} jest już {usluga.status === "SUSPENDED" ? "zawieszona" : "zakończona"}
          {doDopisania ? " — za brak płatności albo przez partnera, więc po wpłacie wróciłaby sama. Zawieszenie za nadużycie zostaje do decyzji obsługi." : "."}
        </p>
      ) : null}
      {dzialajaca && mozeBlokowac ? (
        <label className="flex items-center gap-2 text-xs text-neutral-300" data-blokada="opcja">
          <Checkbox checked={blokuj} onChange={(e) => setBlokuj(e.target.checked)} />
          Przy „Podjęto działania” zablokuj wysyłkę poczty usługi {nazwa} (strona i odbiór poczty działają dalej)
        </label>
      ) : null}
      {dzialajaca && !mozeBlokowac ? (
        <p className="text-xs text-muted-foreground" data-blokada="brak-uprawnien">
          Blokada wysyłki poczty {nazwa} wymaga uprawnienia MAIL_SEND_BLOCK.
        </p>
      ) : null}
      {doZawieszenia && mozeZawiesic ? (
        <label className="flex items-center gap-2 text-xs text-neutral-300" data-zawies="opcja">
          <Checkbox checked={zawies} onChange={(e) => { setZawies(e.target.checked); setPotwierdzenie(false); }} />
          {doDopisania ? `Przy „Podjęto działania” zawieś usługę ${nazwa} także za nadużycie` : `Przy „Podjęto działania” zawieś usługę ${nazwa}`}
        </label>
      ) : null}
      {doZawieszenia && !mozeZawiesic ? (
        <p className="text-xs text-muted-foreground" data-zawies="brak-uprawnien">
          Zawieszenie usługi {nazwa} wymaga uprawnienia SUBSCRIPTIONS_SUSPEND — wyślij wniosek z karty usługi w panelu operatora.
        </p>
      ) : null}
      {potwierdzenie ? (
        <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3" data-zawies="potwierdzenie">
          <p className="text-xs text-rose-100">
            {doDopisania
              ? `Zawiesić ${nazwa} za nadużycie? Usługa zostanie zawieszona także po opłaceniu zaległości — odwiesza ją dopiero obsługa. Wpis trafi do dziennika klienta jako działanie obsługi Verris.`
              : `Zawiesić ${nazwa}? Strona, poczta (odbiór i wysyłka) i FTP klienta przestaną działać do odwieszenia. Wpis trafi do dziennika klienta jako działanie obsługi Verris.`}
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

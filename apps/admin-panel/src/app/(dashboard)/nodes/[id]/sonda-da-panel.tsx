"use client";

import { useState, useTransition } from "react";
import { sondaDaAction, type SondaDa } from "../actions";

/** Sonda API DirectAdmina: te same odczyty co panel, z control-plane, bez SSH. Pokazuje tylko nazwy pól. */
export function SondaDaPanel({ serverId }: { serverId: string }) {
  const [wynik, setWynik] = useState<SondaDa | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const uruchom = () =>
    start(async () => {
      setBlad(null);
      const r = await sondaDaAction(serverId);
      if (r.error) setBlad(r.error);
      else setWynik(r.data ?? null);
    });
  const tekst = wynik
    ? [`konto ${wynik.konto} · domena ${wynik.domena}`, ...wynik.wyniki.map((w) => `${w.json ? "json" : "    "} ${w.poziom.padEnd(6)} ${w.sciezka.padEnd(62)} ${w.kod} ${w.format} ${w.ksztalt}`)].join("\n")
    : "";
  return (
    <section className="rounded-[10px] border border-line bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-[15px] font-bold text-foreground">Sonda API DirectAdmina</h3>
          <p className="m-0 text-[12.5px] text-muted-foreground">
            Odczyty, których używa panel, na pierwszym aktywnym koncie węzła — kod, format i nazwy pól, bez wartości. Po aktualizacji DA sprawdź, czy kształt się nie zmienił.
          </p>
        </div>
        <button type="button" onClick={uruchom} disabled={pending} className="rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50">
          {pending ? "Sprawdzam…" : "Uruchom sondę"}
        </button>
      </div>
      {blad ? <p className="m-0 text-[12.5px] text-crit">{blad}</p> : null}
      {wynik ? (
        <>
          <button type="button" onClick={() => void navigator.clipboard.writeText(tekst)} className="text-xs text-data-hi underline">
            Kopiuj wynik
          </button>
          <pre className="m-0 max-h-[480px] overflow-auto rounded-[7px] bg-raised p-3 text-[11.5px] leading-5 text-foreground">{tekst}</pre>
        </>
      ) : null}
    </section>
  );
}

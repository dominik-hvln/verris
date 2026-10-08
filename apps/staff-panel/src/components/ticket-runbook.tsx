"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RUNBOOKI, runbook, zalecanyRunbook } from "@verris/contracts";
import { staffApplyRunbook } from "@/lib/ticket-actions";
import { Select } from "@/components/select";
import { Karta } from "@/components/ticket-client-aside";
import { Checkbox } from "./checkbox";

/**
 * PB-43 — runbook przy zgłoszeniu: zalecany z rozpoznanej kategorii (strona nie działa, poczta, SSL,
 * migracja…) albo wybrany ręcznie; kroki jako lista kontrolna. „Zapisz przy zgłoszeniu” utrwala wybór
 * (widać go w kolejce i w dzienniku). Odhaczenia kroków są robocze — nie zapisują się.
 */
export function TicketRunbook({
  ticketId,
  runbookKey,
  kategoria,
  dzial,
}: {
  ticketId: string;
  runbookKey: string | null | undefined;
  kategoria: string | null | undefined;
  dzial: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const zalecany = zalecanyRunbook(kategoria, dzial);
  const zapisany = runbook(runbookKey);
  const [wybrany, setWybrany] = useState((zapisany ?? zalecany).klucz);
  const rb = runbook(wybrany) ?? zalecany;
  const poleId = useId();

  const zapisz = () =>
    start(async () => {
      setBlad(null);
      const r = await staffApplyRunbook(ticketId, rb.klucz);
      if ("error" in r) setBlad(r.error);
      else router.refresh();
    });

  return (
    <Karta>
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[15px] font-bold">Runbook</h2>
          {rb.klucz === zalecany.klucz ? <span className="rounded-full bg-data-soft px-2 py-px text-[11.5px] font-semibold text-data-hi">zalecany</span> : null}
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <label htmlFor={poleId} className="sr-only">
            Wybierz runbook
          </label>
          <Select
            id={poleId}
            value={rb.klucz}
            onChange={setWybrany}
            options={RUNBOOKI.map((r) => ({ value: r.klucz, label: r.nazwa }))}
          />
        </div>
        <p className="text-[12.5px] text-muted-foreground">{rb.kiedy}</p>
        <div key={rb.klucz} className="flex flex-col gap-1.5">
          {rb.kroki.map((x) => (
            <label key={x} className="flex items-start gap-2 text-[13.5px] leading-[1.4]">
              <Checkbox className="mt-0.5 h-4 w-4" /> {x}
            </label>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <span className="text-[12.5px] text-muted-foreground">
            {runbookKey ? `Przy zgłoszeniu: ${zapisany?.nazwa ?? runbookKey}` : "Przy zgłoszeniu: brak"}
          </span>
          {runbookKey !== rb.klucz ? (
            <button
              type="button"
              disabled={pending}
              onClick={zapisz}
              className="ml-auto inline-flex h-8 items-center rounded-[9px] border border-line-strong bg-card px-2.5 text-[12.5px] font-semibold text-foreground hover:border-primary disabled:opacity-50"
            >
              Zapisz przy zgłoszeniu
            </button>
          ) : null}
        </div>
        {blad ? (
          <p role="alert" className="text-[13px] text-crit">
            {blad}
          </p>
        ) : null}
      </div>
    </Karta>
  );
}

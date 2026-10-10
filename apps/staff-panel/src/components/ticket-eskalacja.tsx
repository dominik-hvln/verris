"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { staffEscalateTicket, staffSetRiskFlag, staffUndoEscalation } from "@/lib/ticket-actions";
import { Karta } from "@/components/ticket-client-aside";

/**
 * F2.5 — eskalacja z powodem i cofnięciem, flaga ryzyka zakładana i zdejmowana z powodem. Jedno pole „Powód”
 * dla wszystkich czterech działań — trafia do dziennika i na oś zgłoszenia (min. 10 znaków, pilnuje API).
 */
export function TicketEskalacja({
  ticketId,
  eskalowane,
  powodEskalacji,
  ryzyko,
  opisRyzyka,
  kiedyEskalowano,
}: {
  ticketId: string;
  eskalowane: boolean;
  powodEskalacji: string | null;
  ryzyko: string | null;
  opisRyzyka: string | null;
  kiedyEskalowano: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [powod, setPowod] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const poleId = useId();
  const dzialanie = (fn: () => Promise<{ error: string } | { ok: true }>) =>
    start(async () => {
      setBlad(null);
      const r = await fn();
      if ("error" in r) setBlad(r.error);
      else {
        setPowod("");
        router.refresh();
      }
    });
  const p = powod.trim();
  const zaKrotki = p.length < 10;
  const PRZYCISK = "inline-flex h-8 items-center rounded-[9px] border px-2.5 text-[12.5px] font-semibold disabled:opacity-50";
  return (
    <Karta>
      <div className="flex flex-col gap-2 px-4 py-3.5" data-karta="eskalacja">
        <h2 className="font-display text-[15px] font-bold">Eskalacja i ryzyko</h2>
        <p className="text-[13px] text-muted-foreground">
          {eskalowane ? `Eskalowane${kiedyEskalowano ? ` ${kiedyEskalowano}` : ""}${powodEskalacji ? ` — ${powodEskalacji}` : ""}` : "Nieeskalowane"}
          {ryzyko ? ` · ryzyko: ${opisRyzyka ?? ryzyko}` : ""}
        </p>
        <label htmlFor={poleId} className="text-[12.5px] font-semibold">
          Powód (trafi do dziennika)
        </label>
        <textarea
          id={poleId}
          rows={2}
          value={powod}
          maxLength={2000}
          onChange={(e) => setPowod(e.target.value)}
          placeholder="np. klient traci sprzedaż, potrzebny L3"
          className="resize-y rounded-lg border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-data"
        />
        <div className="flex flex-wrap gap-2">
          {eskalowane ? (
            <button type="button" disabled={pending || zaKrotki} onClick={() => dzialanie(() => staffUndoEscalation(ticketId, p))} className={`${PRZYCISK} border-line-strong bg-card`}>
              Cofnij eskalację
            </button>
          ) : (
            <button type="button" disabled={pending || zaKrotki} onClick={() => dzialanie(() => staffEscalateTicket(ticketId, p))} className={`${PRZYCISK} border-warn/40 bg-warn-soft text-warn`}>
              Eskaluj
            </button>
          )}
          {ryzyko ? (
            <button type="button" disabled={pending || zaKrotki} onClick={() => dzialanie(() => staffSetRiskFlag(ticketId, "", p))} className={`${PRZYCISK} border-line-strong bg-card`}>
              Zdejmij flagę ryzyka
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || zaKrotki}
              onClick={() => dzialanie(() => staffSetRiskFlag(ticketId, "SUPPORT_RISK", p))}
              className={`${PRZYCISK} border-crit/40 bg-[color-mix(in_srgb,var(--crit)_10%,transparent)] text-crit`}
            >
              Oznacz ryzyko
            </button>
          )}
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

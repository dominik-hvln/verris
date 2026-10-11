"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TICKET_STATUS_PL } from "@verris/contracts";
import { staffApplyMacro, type MakroRow } from "@/lib/ticket-actions";
import { Karta } from "@/components/ticket-client-aside";

/** Co zrobi makro — jedna linijka pod nazwą (odpowiedź zawsze, potem stan, tagi, przypisanie). */
export function opisMakra(m: Pick<MakroRow, "makroStan" | "makroTagi" | "makroPrzypisz">): string {
  const czesci = ["odpowiedź"];
  czesci.push(m.makroStan ? `stan: ${(TICKET_STATUS_PL[m.makroStan] ?? m.makroStan).toLowerCase()}` : "czekaj na klienta");
  if (m.makroTagi.length) czesci.push(`tagi: ${m.makroTagi.join(", ")}`);
  if (m.makroPrzypisz === "JA") czesci.push("przypisz do mnie");
  if (m.makroPrzypisz === "NIKT") czesci.push("bez opiekuna");
  return czesci.join(" · ");
}

/**
 * F3.7 — makra: szablon odpowiedzi z akcjami jednym kliknięciem. Przed zastosowaniem podgląd treści (idzie do
 * klienta) i lista akcji — potwierdzenie w karcie, bez okna systemowego. Makra ustawia administrator
 * („Szablony odpowiedzi” w panelu operatora).
 */
export function TicketMakra({ ticketId, makra, zablokowane }: { ticketId: string; makra: MakroRow[] | null; zablokowane?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [wybrane, setWybrane] = useState<MakroRow | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  if (makra && makra.length === 0) return null;
  return (
    <Karta>
      <div className="flex flex-col gap-2 px-4 py-3.5" data-karta="makra">
        <h2 className="font-display text-[15px] font-bold">Makra</h2>
        {makra === null ? <p className="text-[12.5px] text-crit">Nie udało się wczytać makr — odśwież stronę.</p> : null}
        {zablokowane ? <p className="text-[12.5px] text-muted-foreground">{zablokowane}</p> : null}
        {!wybrane
          ? (makra ?? []).map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!!zablokowane || pending}
                onClick={() => {
                  setBlad(null);
                  setWybrane(m);
                }}
                className="flex flex-col items-start rounded-lg border border-line px-2.5 py-2 text-left hover:border-primary disabled:opacity-50"
              >
                <span className="text-[13px] font-semibold">{m.title}</span>
                <span className="text-[11.5px] text-muted-foreground">{opisMakra(m)}</span>
              </button>
            ))
          : null}
        {wybrane ? (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-data-soft/40 px-3 py-2.5" data-makro="potwierdzenie">
            <b className="text-[13px]">{wybrane.title}</b>
            <p className="max-h-[160px] overflow-auto whitespace-pre-wrap text-[12.5px]">{wybrane.content}</p>
            <p className="text-[12px] text-muted-foreground">{opisMakra(wybrane)}. Klient dostanie tę odpowiedź mailem.</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await staffApplyMacro(ticketId, wybrane.id);
                    if ("error" in r) setBlad(r.error);
                    else {
                      setWybrane(null);
                      router.refresh();
                    }
                  })
                }
                className="inline-flex h-8 items-center rounded-[9px] border border-primary bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                Zastosuj
              </button>
              <button type="button" disabled={pending} onClick={() => setWybrane(null)} className="inline-flex h-8 items-center rounded-[9px] border border-line-strong bg-card px-3 text-[12.5px] font-semibold">
                Anuluj
              </button>
            </div>
          </div>
        ) : null}
        {blad ? (
          <p role="alert" className="text-[12.5px] text-crit">
            {blad}
          </p>
        ) : null}
      </div>
    </Karta>
  );
}

"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TICKET_STATUS_PL } from "@verris/contracts";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/checkbox";
import { Karta } from "@/components/ticket-client-aside";
import { WyslijWniosek } from "@/components/wniosek-operacji";
import { staffMergeTicket } from "@/lib/ticket-actions";
import type { KandydatScalenia } from "@/lib/tickets-data";

/**
 * F3.7 — scalenie z innym zgłoszeniem tego klienta. Ten wątek (odpowiedzi, notatki — dalej wewnętrzne, pliki)
 * przechodzi do wybranego zgłoszenia, a to zostaje zamknięte. Nieodwracalne: powód i zaznaczone „rozumiem”.
 * Od L3 (TICKETS_MERGE) bezpośrednio; niżej „Wyślij wniosek” (D2).
 */
export function TicketScalanie({
  ticketId,
  userId,
  kandydaci,
  mozeScalic,
}: {
  ticketId: string;
  userId: string;
  kandydaci: KandydatScalenia[] | null;
  mozeScalic: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [celId, setCelId] = useState("");
  const [powod, setPowod] = useState("");
  const [rozumiem, setRozumiem] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [wniosek, setWniosek] = useState(!mozeScalic);
  const powodId = useId();
  if (kandydaci && kandydaci.length === 0) return null;
  const kiedy = (d: string) => new Date(d).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit" });
  return (
    <Karta>
      <details className="px-4 py-3.5" data-karta="scalanie">
        <summary className="cursor-pointer font-display text-[15px] font-bold">Scal z innym zgłoszeniem</summary>
        {kandydaci === null ? (
          <p className="mt-2 text-[12.5px] text-crit">Nie udało się wczytać zgłoszeń klienta — odśwież stronę.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[12.5px] text-muted-foreground">
              Ten wątek przejdzie do wybranego zgłoszenia, a to zostanie zamknięte. Notatki zostają wewnętrzne. Nie da się tego cofnąć.
            </p>
            <Select
              aria-label="Zgłoszenie docelowe"
              value={celId}
              onChange={setCelId}
              className="h-[34px] rounded-lg border border-line-strong bg-card px-2.5 text-[13px]"
              options={[
                { value: "", label: "wybierz zgłoszenie…" },
                ...kandydaci.map((k) => ({ value: k.id, label: `#${k.id.slice(0, 8)} · ${k.subject} · ${(TICKET_STATUS_PL[k.status] ?? k.status).toLowerCase()} · ${kiedy(k.createdAt)}` })),
              ]}
            />
            {wniosek ? (
              <WyslijWniosek
                typ="TICKET_MERGE"
                userId={userId}
                payload={{ zrodloId: ticketId, celId }}
                gotowe={!!celId}
                podpowiedz="Scalenie jest nieodwracalne — robi je L3 albo kierownik. Wybierz zgłoszenie i wyślij wniosek."
              />
            ) : (
              <>
                <label htmlFor={powodId} className="text-[12px] font-semibold">
                  Powód (w historii obu zgłoszeń i w dzienniku)
                </label>
                <textarea
                  id={powodId}
                  rows={2}
                  value={powod}
                  maxLength={2000}
                  onChange={(e) => setPowod(e.target.value)}
                  className="resize-y rounded-lg border border-line-strong bg-background px-2.5 py-2 text-[13px] text-foreground outline-none focus:border-data"
                />
                <label className="flex items-center gap-2 text-[12.5px]">
                  <Checkbox checked={rozumiem} onChange={(e) => setRozumiem(e.target.checked)} /> Rozumiem — scalenia nie da się cofnąć
                </label>
                <button
                  type="button"
                  disabled={pending || !celId || !rozumiem || powod.trim().length < 10}
                  onClick={() =>
                    start(async () => {
                      setBlad(null);
                      const r = await staffMergeTicket(ticketId, celId, powod);
                      if ("error" in r) {
                        setBlad(r.error);
                        if (r.wymagaWniosku) setWniosek(true);
                      } else router.push(`/tickets/${r.celId}`);
                    })
                  }
                  className="inline-flex h-8 items-center self-start rounded-[9px] border border-crit/50 bg-[color-mix(in_srgb,var(--crit)_10%,transparent)] px-3 text-[12.5px] font-semibold text-crit disabled:opacity-50"
                >
                  Scal zgłoszenia
                </button>
              </>
            )}
            {blad ? (
              <p role="alert" className="text-[12.5px] text-crit">
                {blad}
              </p>
            ) : null}
          </div>
        )}
      </details>
    </Karta>
  );
}

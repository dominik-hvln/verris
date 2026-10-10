"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { staffListTags, staffSetTags } from "@/lib/ticket-actions";
import { Karta } from "@/components/ticket-client-aside";

/**
 * F2.5 — tagi zgłoszenia (filtr skrzynki; klient ich nie widzi). Dodanie: wpisz i Enter albo kliknij podpowiedź
 * z tagów w użyciu. API normalizuje (małe litery, spacje → myślnik) i pilnuje limitu 10.
 */
export function TicketTagi({ ticketId, tagi }: { ticketId: string; tagi: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nowy, setNowy] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [wUzyciu, setWUzyciu] = useState<string[]>([]);
  const poleId = useId();
  useEffect(() => {
    void staffListTags().then((r) => setWUzyciu(r.map((x) => x.tag)));
  }, []);
  const zapisz = (lista: string[]) =>
    start(async () => {
      setBlad(null);
      const r = await staffSetTags(ticketId, lista);
      if ("error" in r) setBlad(r.error);
      else {
        setNowy("");
        router.refresh();
      }
    });
  const podpowiedzi = wUzyciu.filter((t) => !tagi.includes(t) && (!nowy.trim() || t.includes(nowy.trim().toLowerCase()))).slice(0, 6);
  return (
    <Karta>
      <div className="flex flex-col gap-2 px-4 py-3.5" data-karta="tagi">
        <h2 className="font-display text-[15px] font-bold">Tagi</h2>
        <div className="flex flex-wrap gap-1.5">
          {tagi.length === 0 ? <span className="text-[12.5px] text-muted-foreground">Bez tagów — klient ich nie widzi.</span> : null}
          {tagi.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold">
              {t}
              <button type="button" aria-label={`Usuń tag ${t}`} disabled={pending} onClick={() => zapisz(tagi.filter((x) => x !== t))} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (nowy.trim()) zapisz([...tagi, nowy]);
          }}
        >
          <label htmlFor={poleId} className="sr-only">
            Nowy tag
          </label>
          <input
            id={poleId}
            value={nowy}
            maxLength={32}
            onChange={(e) => setNowy(e.target.value)}
            placeholder="dodaj tag…"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-2.5 text-[13px] text-foreground outline-none focus:border-data"
          />
          <button type="submit" disabled={pending || !nowy.trim()} className="inline-flex h-8 items-center rounded-[9px] border border-line-strong bg-card px-2.5 text-[12.5px] font-semibold disabled:opacity-50">
            Dodaj
          </button>
        </form>
        {podpowiedzi.length ? (
          <div className="flex flex-wrap gap-1">
            {podpowiedzi.map((t) => (
              <button key={t} type="button" disabled={pending} onClick={() => zapisz([...tagi, t])} className="rounded-full border border-dashed border-line-strong px-2 py-px text-[11.5px] text-muted-foreground hover:text-foreground">
                + {t}
              </button>
            ))}
          </div>
        ) : null}
        {blad ? (
          <p role="alert" className="text-[13px] text-crit">
            {blad}
          </p>
        ) : null}
      </div>
    </Karta>
  );
}

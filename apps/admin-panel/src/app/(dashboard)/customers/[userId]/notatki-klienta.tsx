"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { PRZYCISK } from "@/components/v2";
import { Checkbox } from "@/components/checkbox";
import { dodajNotatkeAction, przypnijNotatkeAction } from "../actions";

/** Odpowiedź GET /admin/users/:id/notes (przypięte pierwsze, potem od najnowszej). */
export interface NotatkaKlienta {
  id: string;
  tresc: string;
  przypieta: boolean;
  utworzono: string;
  autor: { id: string; nazwa: string } | null;
}

const kiedy = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });

/**
 * F2.4 — notatki wewnętrzne o kliencie: wiele, z autorem i datą, przypięte na górze (wcześniej jedno pole
 * nadpisywane bez historii). Bez edycji i usuwania — notatka to ślad pracy obsługi. `mozePisac` jak API:
 * CUSTOMERS_VIEW i TICKETS_MANAGE albo CUSTOMERS_MANAGE.
 */
export function NotatkiKlienta({ userId, notatki, mozePisac }: { userId: string; notatki: NotatkaKlienta[]; mozePisac: boolean }) {
  const router = useRouter();
  const [tresc, setTresc] = useState("");
  const [przypnij, setPrzypnij] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dodaj = () =>
    start(async () => {
      const r = await dodajNotatkeAction(userId, tresc, przypnij);
      if (!r.ok) return setBlad(r.error);
      setBlad(null);
      setTresc("");
      setPrzypnij(false);
      router.refresh();
    });
  const przelacz = (n: NotatkaKlienta) =>
    start(async () => {
      const r = await przypnijNotatkeAction(userId, n.id, !n.przypieta);
      if (!r.ok) return setBlad(r.error);
      setBlad(null);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Widzi tylko zespół Verris</span>
      {notatki.length === 0 ? <p className="text-sm text-muted-foreground">Brak notatek.</p> : null}
      <ul className="flex flex-col gap-2">
        {notatki.map((n) => (
          <li key={n.id} data-notatka={n.przypieta ? "przypieta" : "zwykla"} className={`rounded-[9px] border px-3 py-2 ${n.przypieta ? "border-primary bg-data-soft" : "border-line"}`}>
            <p className="whitespace-pre-wrap break-words text-sm">{n.tresc}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              {n.przypieta ? <Pin className="h-3 w-3" aria-label="Przypięta" /> : null}
              <span>
                {n.autor?.nazwa ?? "notatka sprzed zmian"} · {kiedy(n.utworzono)}
              </span>
              {mozePisac ? (
                <button type="button" onClick={() => przelacz(n)} disabled={pending} className="ml-auto font-semibold text-data-hi hover:underline disabled:opacity-50">
                  {n.przypieta ? "Odepnij" : "Przypnij"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {mozePisac ? (
        <div className="flex flex-col gap-2" data-notatki="dodaj">
          <textarea
            rows={3}
            value={tresc}
            maxLength={5000}
            onChange={(e) => setTresc(e.target.value)}
            aria-label="Nowa notatka"
            placeholder="Nowa notatka (np. ustalenia z rozmowy)"
            className="resize-y rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={przypnij} onChange={(e) => setPrzypnij(e.target.checked)} disabled={pending} />
              Przypnij
            </label>
            <button type="button" onClick={dodaj} disabled={pending || !tresc.trim()} className={`${PRZYCISK} !h-8 !text-[13px]`}>
              {pending ? "Zapisuję…" : "Dodaj notatkę"}
            </button>
            {blad ? <span className="text-[13px] text-crit">{blad}</span> : null}
          </div>
        </div>
      ) : blad ? (
        <span className="text-[13px] text-crit">{blad}</span>
      ) : null}
    </div>
  );
}

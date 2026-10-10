"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TICKET_PRIORITY_PL, etykieta } from "@verris/contracts";
import { PRZYCISK } from "@/components/v2";
import { Select } from "@/components/select";
import { Pomoc } from "@/components/pomoc";
import { zgloszenieWImieniuAction } from "../actions";

const POLE = "rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";

/**
 * F2.5 — „Nowe zgłoszenie w imieniu klienta” na karcie klienta (zakładka Zgłoszenia). Klient dostaje mail od
 * „Obsługa Verris” (bez nazwiska); wątek prowadzi się w panelu obsługi, więc po zapisie pokazujemy link.
 */
export function NoweZgloszenieKlienta({ userId, panelObslugi }: { userId: string; panelObslugi: string }) {
  const router = useRouter();
  const [otwarte, setOtwarte] = useState(false);
  const [temat, setTemat] = useState("");
  const [tresc, setTresc] = useState("");
  const [priorytet, setPriorytet] = useState("NORMAL");
  const [blad, setBlad] = useState<string | null>(null);
  const [nowe, setNowe] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const wyslij = () =>
    start(async () => {
      const r = await zgloszenieWImieniuAction(userId, { subject: temat, message: tresc, priority: priorytet });
      if (!r.ok) return setBlad(r.error);
      setBlad(null);
      setNowe(r.id);
      setTemat("");
      setTresc("");
      setOtwarte(false);
      router.refresh();
    });
  return (
    <div id="nowe-zgloszenie" className="flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">Nowe zgłoszenie w imieniu klienta</b>
        <Pomoc id="zgloszenie-w-imieniu" />
        {!otwarte ? (
          <button type="button" onClick={() => setOtwarte(true)} className={`${PRZYCISK} ml-auto !h-8 !text-[13px]`}>
            Napisz do klienta
          </button>
        ) : null}
      </div>
      {nowe ? (
        <p className="text-[13px] text-muted-foreground">
          Założone #{nowe.slice(0, 8)} —{" "}
          <a href={new URL(`/tickets/${nowe}`, panelObslugi).toString()} target="_blank" rel="noreferrer" className="font-semibold text-data-hi">
            otwórz w panelu obsługi ↗
          </a>
        </p>
      ) : null}
      {otwarte ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-t`} className="text-[13px] font-semibold">
            Temat
          </label>
          <input id={`${id}-t`} value={temat} maxLength={200} onChange={(e) => setTemat(e.target.value)} className={POLE} />
          <label htmlFor={`${id}-w`} className="text-[13px] font-semibold">
            Wiadomość do klienta
          </label>
          <textarea id={`${id}-w`} rows={6} value={tresc} onChange={(e) => setTresc(e.target.value)} className={`${POLE} resize-y`} />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-p`} className="text-[13px] font-semibold">
              Priorytet
            </label>
            <Select id={`${id}-p`} value={priorytet} onChange={setPriorytet} options={["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => ({ value: p, label: etykieta(TICKET_PRIORITY_PL, p) }))} />
            <span className="ml-auto flex gap-2">
              <button type="button" onClick={() => setOtwarte(false)} className={`${PRZYCISK} !h-8 !text-[13px]`}>
                Anuluj
              </button>
              <button type="button" disabled={pending} onClick={wyslij} className={`${PRZYCISK} !h-8 !border-primary !bg-primary !text-[13px] !text-primary-foreground disabled:opacity-50`}>
                Załóż i wyślij
              </button>
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground">Klient dostanie mail od „Obsługa Verris”, a zgłoszenie od razu czeka na jego odpowiedź.</p>
        </div>
      ) : null}
      {blad ? (
        <p role="alert" className="text-[13px] text-crit">
          {blad}
        </p>
      ) : null}
    </div>
  );
}

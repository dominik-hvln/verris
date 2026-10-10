"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/select";
import { staffCreateTicketOnBehalf } from "@/lib/ticket-actions";
import { TICKET_DEPARTMENT_PL, TICKET_PRIORITY_PL, etykieta } from "@verris/contracts";

const POLE = "rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-[14.5px] text-foreground outline-none focus:border-data";

/** F2.5 — formularz zgłoszenia w imieniu klienta; po zapisie przechodzi do wątku nowego zgłoszenia. */
export function NoweZgloszenieForm({ userId, email }: { userId: string | null; email: string }) {
  const router = useRouter();
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  return (
    <form
      className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4"
      action={(fd) =>
        start(async () => {
          setBlad(null);
          const r = await staffCreateTicketOnBehalf(fd);
          if ("error" in r) setBlad(r.error);
          else router.push(`/tickets/${r.id}`);
        })
      }
    >
      {userId ? (
        <p className="text-sm text-muted-foreground">
          Klient wybrany z karty (konto #{userId.slice(0, 8)}).
          <input type="hidden" name="userId" value={userId} />
        </p>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor={`${id}-email`}>
          E-mail klienta
          <input id={`${id}-email`} name="email" type="email" required defaultValue={email} className={POLE} placeholder="adres konta w panelu klienta" />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor={`${id}-temat`}>
        Temat
        <input id={`${id}-temat`} name="subject" required minLength={3} maxLength={200} className={POLE} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor={`${id}-tresc`}>
        Wiadomość do klienta
        <textarea id={`${id}-tresc`} name="message" required minLength={10} rows={8} className={`${POLE} resize-y`} />
      </label>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="flex items-center gap-2">
          <label htmlFor={`${id}-prio`} className="font-semibold">Priorytet</label>
          <Select id={`${id}-prio`} name="priority" defaultValue="NORMAL" options={["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => ({ value: p, label: etykieta(TICKET_PRIORITY_PL, p) }))} />
        </span>
        <span className="flex items-center gap-2">
          <label htmlFor={`${id}-dzial`} className="font-semibold">Dział</label>
          <Select id={`${id}-dzial`} name="department" defaultValue="TECHNICAL" options={["TECHNICAL", "BILLING", "SALES"].map((d) => ({ value: d, label: etykieta(TICKET_DEPARTMENT_PL, d) }))} />
        </span>
      </div>
      {blad ? (
        <p role="alert" className="text-sm text-crit">
          {blad}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-[38px] items-center rounded-[9px] border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:opacity-50"
        >
          Załóż i wyślij do klienta
        </button>
      </div>
    </form>
  );
}

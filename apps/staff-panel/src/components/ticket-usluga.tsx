"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServiceDiagnosticsDto } from "@verris/contracts";
import { SUBSCRIPTION_STATUS_PL, etykieta } from "@verris/contracts";
import type { StaffTicketDetail, TicketContext } from "@/lib/tickets-data";
import { staffLinkTicketService, staffTicketDiagnostics } from "@/lib/ticket-actions";
import { Select } from "@/components/select";
import { Karta } from "@/components/ticket-client-aside";
import { plForm } from "@/lib/pl";

type Usluga = NonNullable<StaffTicketDetail["subscription"]>;

/** Domena, bez niej plan; tag usługi w nawiasie. */
export function nazwaUslugiZgloszenia(u: { serviceTag?: string | null; plan?: { name: string } | string | null; account?: { domain: string } | null; domain?: string | null }): string {
  const plan = typeof u.plan === "string" ? u.plan : (u.plan?.name ?? null);
  const glowna = u.account?.domain ?? u.domain ?? plan ?? "Usługa";
  return u.serviceTag ? `${glowna} (${u.serviceTag})` : glowna;
}

const TON: Record<string, string> = { ok: "text-data-hi", warn: "text-warn", attention: "text-warn", critical: "text-crit" };
const OGOLNIE: Record<ServiceDiagnosticsDto["overall"], string> = {
  ok: "Brak problemów",
  attention: "Wymaga uwagi",
  critical: "Pilne problemy",
};

/**
 * PB-43 — usługa, której dotyczy zgłoszenie, przy rozmowie: karta usługi, diagnostyka z wynikiem obok
 * i zmiana powiązania (obsługa z uprawnieniem do zgłoszeń; API sprawdza, że usługa należy do klienta).
 */
export function TicketUsluga({
  ticketId,
  userId,
  usluga,
  uslugiKlienta,
}: {
  ticketId: string;
  userId: string;
  usluga: Usluga | null;
  /** Usługi klienta z podglądu (PB-18); null = podgląd się nie wczytał. */
  uslugiKlienta: TicketContext["services"] | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<ServiceDiagnosticsDto | null>(null);
  const poleId = useId();

  const diagnozuj = () =>
    start(async () => {
      setBlad(null);
      const r = await staffTicketDiagnostics(ticketId);
      if (r.ok) setWynik(r.data);
      else setBlad(r.error);
    });

  const zmien = (v: string) =>
    start(async () => {
      setBlad(null);
      const r = await staffLinkTicketService(ticketId, v === "" ? null : v);
      if ("error" in r) setBlad(r.error);
      else {
        setWynik(null);
        router.refresh();
      }
    });

  return (
    <Karta tytul="Usługa zgłoszenia" id="usl-zgl">
      <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3.5">
        {usluga ? (
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{nazwaUslugiZgloszenia(usluga)}</span>
            <span className="text-[12.5px] text-muted-foreground">
              {usluga.plan?.name ?? "—"} · {etykieta(SUBSCRIPTION_STATUS_PL, usluga.status).toLowerCase()}
            </span>
          </div>
        ) : (
          <span className="text-[13.5px] text-muted-foreground">Zgłoszenie nie jest powiązane z usługą.</span>
        )}
        {usluga ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={diagnozuj}
              className="inline-flex h-8 items-center rounded-[9px] border border-primary bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-data-hi disabled:opacity-50"
            >
              {pending ? "Diagnozuję…" : "Diagnostyka"}
            </button>
            <Link
              href={`/crm/${userId}/subscriptions/${usluga.id}`}
              className="inline-flex h-8 items-center rounded-[9px] border border-line-strong bg-card px-3 text-[13px] font-semibold text-foreground no-underline hover:border-primary"
            >
              Karta usługi
            </Link>
          </div>
        ) : null}
        {uslugiKlienta ? (
          <div className="flex items-center gap-2 text-[13px]">
            <label htmlFor={poleId} className="text-muted-foreground">
              {usluga ? "Zmień:" : "Wskaż:"}
            </label>
            <Select
              id={poleId}
              value={usluga?.id ?? ""}
              disabled={pending}
              onChange={zmien}
              options={[
                ...uslugiKlienta.map((s) => ({ value: s.id, label: nazwaUslugiZgloszenia(s) })),
                { value: "", label: "bez usługi" },
              ]}
            />
          </div>
        ) : (
          <span className="text-[12.5px] text-muted-foreground">Lista usług klienta niedostępna — powiązanie zmienisz po odświeżeniu.</span>
        )}
        {blad ? (
          <p role="alert" className="text-[13px] text-crit">
            {blad}
          </p>
        ) : null}
        {wynik ? (
          <div className="flex flex-col gap-2 rounded-lg bg-raised/60 px-3 py-2.5" aria-live="polite">
            <span className={`text-[13.5px] font-semibold ${TON[wynik.overall] ?? ""}`}>
              {OGOLNIE[wynik.overall]} · {wynik.findings.length} {plForm(wynik.findings.length, "ustalenie", "ustalenia", "ustaleń")}
            </span>
            <span className="text-[12.5px] text-[color:var(--verris-body)]">{wynik.summary}</span>
            {wynik.findings.map((f, i) => (
              <div key={i} className="flex flex-col border-t border-line pt-1.5 text-[12.5px]">
                <b className={TON[f.status] ?? ""}>{f.title}</b>
                <span className="text-[color:var(--verris-body)]">{f.detail}</span>
                {f.action ? <span className="text-muted-foreground">Co zrobić: {f.action}</span> : null}
              </div>
            ))}
            <span className="font-mono text-[11px] text-muted-foreground">
              {new Date(wynik.generatedAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}
            </span>
          </div>
        ) : null}
      </div>
    </Karta>
  );
}

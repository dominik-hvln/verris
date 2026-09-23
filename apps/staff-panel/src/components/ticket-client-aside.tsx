"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TicketContext } from "@/lib/tickets-data";

const SUB_STATUS: Record<string, string> = {
  ACTIVE: "aktywna",
  PAST_DUE: "zaległa płatność",
  SUSPENDED: "zawieszona",
  PROVISIONING: "zakładanie",
  PENDING_PAYMENT: "czeka na płatność",
  CANCELED: "anulowana",
  EXPIRED: "wygasła",
};
const INV_STATUS: Record<string, string> = { DRAFT: "szkic", OPEN: "do zapłaty", PAID: "opłacona", VOID: "anulowana", UNCOLLECTIBLE: "nieściągalna" };
const TICKET_STATUS: Record<string, string> = { OPEN: "otwarte", IN_PROGRESS: "w realizacji", WAITING_CUSTOMER: "czeka na klienta", CLOSED: "zamknięte" };

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("pl-PL") : "—");
const tone = (score: number | null) =>
  score == null ? "text-neutral-400" : score >= 80 ? "text-emerald-300" : score >= 50 ? "text-amber-300" : "text-rose-300";

/** PB-18 — licznik SLA: ile zostało do terminu albo o ile go przekroczono. */
export function SlaCountdown({ label, due, done }: { label: string; due: string | null; done: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!due) return <p className="text-xs text-neutral-400">{label}: —</p>;
  const diff = new Date(due).getTime() - now;
  const mins = Math.round(Math.abs(diff) / 60_000);
  const txt = mins >= 1440 ? `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  const color = done ? "text-neutral-400" : diff < 0 ? "text-rose-300" : diff < 2 * 3_600_000 ? "text-amber-300" : "text-emerald-300";
  return (
    <p className="text-xs text-neutral-300">
      {label}:{" "}
      <span className={`font-semibold ${color}`}>{done ? "spełnione" : diff < 0 ? `po terminie o ${txt}` : `zostało ${txt}`}</span>
      <span className="text-neutral-500"> · {new Date(due).toLocaleString("pl-PL")}</span>
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/10 pt-3 first:border-0 first:pt-0">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

/** PB-18 — boczny podgląd klienta: wszystko potrzebne do odpowiedzi bez przechodzenia między ekranami. */
export function TicketClientAside({ context, userId }: { context: TicketContext | null; userId: string }) {
  if (!context) {
    return (
      <aside className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-neutral-400">
        Nie udało się wczytać podglądu klienta. Pełne dane są w{" "}
        <Link href={`/crm/${userId}`} className="text-cyan-400 hover:underline">profilu klienta</Link>.
      </aside>
    );
  }
  const c = context;
  return (
    <aside className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm">
      <Section title="Klient">
        <p className="font-semibold text-white">{c.client.name ?? c.client.email}</p>
        {c.client.company ? <p className="text-xs text-neutral-400">{c.client.company}</p> : null}
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-neutral-500">Saldo</dt>
          <dd className="text-neutral-200">{c.client.walletBalance != null ? `${c.client.walletBalance} K` : "—"}</dd>
          <dt className="text-neutral-500">Health score</dt>
          <dd className={`font-semibold ${tone(c.healthScore)}`}>{c.healthScore ?? "—"}</dd>
          <dt className="text-neutral-500">Klient od</dt>
          <dd className="text-neutral-200">{day(c.client.since)}</dd>
        </dl>
      </Section>

      <Section title={`Usługi (${c.services.length})`}>
        {c.services.length === 0 ? (
          <p className="text-xs text-neutral-400">Brak usług.</p>
        ) : (
          <ul className="space-y-2">
            {c.services.map((s) => (
              <li key={s.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                <Link href={`/crm/${userId}/subscriptions/${s.id}`} className="font-medium text-white hover:text-cyan-300">
                  {s.domain ?? s.plan ?? "Usługa"}
                </Link>
                <p className="mt-0.5 text-neutral-400">
                  {s.plan ?? "—"} · {SUB_STATUS[s.status] ?? s.status}
                  {s.siteStatus === "DOWN" ? <span className="text-rose-300"> · strona nie odpowiada</span> : null}
                </p>
                <p className="text-neutral-500">
                  Health <span className={tone(s.healthScore)}>{s.healthScore ?? "—"}</span> · SSL do {day(s.sslExpiresAt)} · okres do {day(s.currentPeriodEnd)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Dokumenty rozliczeniowe">
        {c.invoices.length === 0 ? (
          <p className="text-xs text-neutral-400">Brak.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {c.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-x-2">
                <span className="text-neutral-200">{i.number}</span>
                <span className={i.status === "OPEN" ? "text-amber-300" : "text-neutral-400"}>
                  {i.amount} {i.currency} · {INV_STATUS[i.status] ?? i.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ostatnie zdarzenia usług">
        {c.events.length === 0 ? (
          <p className="text-xs text-neutral-400">Brak.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {c.events.map((e, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-2">
                <span className="text-neutral-200">
                  {e.type}
                  {e.domain ? <span className="text-neutral-500"> · {e.domain}</span> : null}
                </span>
                <span className="text-neutral-500">{day(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Poprzednie zgłoszenia">
        {c.tickets.length === 0 ? (
          <p className="text-xs text-neutral-400">To pierwsze zgłoszenie.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {c.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="text-neutral-200 hover:text-cyan-300">{t.subject}</Link>
                <span className="text-neutral-500"> · {TICKET_STATUS[t.status] ?? t.status} · {day(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
  );
}

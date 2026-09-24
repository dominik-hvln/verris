"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import type { AgentOption, StaffTicketDetail, TicketAttachmentRow, TicketContext } from "@/lib/tickets-data";
import { Select } from "@/components/select";
import { SlaCountdown, TicketClientAside } from "@/components/ticket-client-aside";
import {
  staffApplyRunbook,
  staffEscalateTicket,
  staffFetchCanned,
  staffGenerateAiSuggestion,
  staffGetAiStatus,
  staffPostReplyWithFiles,
  staffSetRiskFlag,
  staffUpdateTicket,
  type CannedResponseRow,
} from "@/lib/ticket-actions";
import { staffTicketAttachmentDownloadHref } from "@/lib/ticket-attachment-links";
import { StaffImpersonateButton } from "@/app/(dashboard)/crm/impersonate-button";
import { CannedResponsePicker } from "@/components/canned-response-picker";
import { TICKET_DEPARTMENT_PL, TICKET_PRIORITY_PL, TICKET_STATUS_PL, etykieta } from "@verris/contracts";

interface Props {
  ticket: StaffTicketDetail;
  agents: AgentOption[];
  context: TicketContext | null;
}

const STATUS_OPTS = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "CLOSED"] as const;
const STATUS_LABELS = TICKET_STATUS_PL;
const EVENT_LABELS: Record<string, string> = {
  TICKET_CREATED: "Utworzono zgłoszenie",
  CUSTOMER_REPLY: "Odpowiedź klienta",
  STAFF_REPLY: "Odpowiedź supportu",
  STATUS_CHANGED: "Zmiana statusu",
  ASSIGNMENT_CHANGED: "Zmiana przypisania",
  CUSTOMER_REMINDER_SENT: "Przypomnienie do klienta",
  AUTO_CLOSED: "Auto-zamknięcie (brak odpowiedzi)",
  SLA_RESPONSE_BREACH_ALERTED: "Alert: przekroczone SLA",
  ESCALATED: "Eskalacja",
};
const PRI_OPTS = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const DEPT_OPTS = ["BILLING", "TECHNICAL", "SALES"] as const;

function formatKb(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 100 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function AttachmentList({ ticketId, items }: { ticketId: string; items: TicketAttachmentRow[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((a) => (
        <a
          key={a.id}
          href={staffTicketAttachmentDownloadHref(ticketId, a.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/35 px-2.5 py-1 text-xs text-cyan-100/95 hover:bg-white/10"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className="max-w-[18rem] truncate">{a.originalName}</span>
          <span className="opacity-70">({formatKb(a.sizeBytes)})</span>
        </a>
      ))}
    </div>
  );
}

function openingAttachments(ticket: StaffTicketDetail): TicketAttachmentRow[] {
  return (ticket.attachments ?? []).filter((a) => a.replyId == null);
}

export function TicketDetailPanel({ ticket, agents, context }: Props) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const [opsErr, setOpsErr] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<unknown | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [canned, setCanned] = useState<CannedResponseRow[]>([]);
  const replyId = useId();
  const filesId = useId();
  const fieldsId = useId();

  // SUP-2 — pobierz szablony posortowane pod temat zgłoszenia.
  useEffect(() => {
    void staffFetchCanned(ticket.topic ?? undefined, undefined, ticket.id).then(setCanned);
  }, [ticket.topic, ticket.id]);
  const assignedId = ticket.assignedToId ?? ticket.assignedTo?.id ?? "";
  const runbookChecklist =
    ticket.department === "BILLING"
      ? [
          "Sprawdź status ostatniej faktury i płatności.",
          "Zweryfikuj portfel oraz domyślną metodę płatności.",
          "Jeżeli płatność nie przeszła, zaproponuj retry/top-up i jasny termin.",
        ]
      : [
          "Sprawdź otwarte incydenty dla węzła klienta.",
          "Uruchom DNS/TLS diagnostic, jeżeli zgłoszenie dotyczy domeny.",
          "Zweryfikuj ostatnie metryki usage i provisioning/migration timeline.",
        ];

  useEffect(() => {
    let active = true;
    staffGetAiStatus()
      .then((status) => {
        if (active) setAiConfigured(status.configured);
      })
      .catch(() => {
        if (active) setAiConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function patchField(
    patch: Partial<{ status: string; priority: string; department: string; assignedToId: string | null }>,
  ) {
    transition(async () => {
      await staffUpdateTicket(ticket.id, patch);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-6">
        <div>
          <p className="mb-2 text-xs font-mono text-muted-foreground">#{ticket.id}</p>
          <h1 className="text-2xl font-bold text-white">{ticket.subject}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {[ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ") || ticket.user.email} ·{" "}
            <a href={`mailto:${ticket.user.email}`} className="text-cyan-400 hover:underline">
              {ticket.user.email}
            </a>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/crm/${ticket.user.id}`}
              className="inline-flex items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
            >
              Profil klienta (360°)
            </Link>
            <StaffImpersonateButton userId={ticket.user.id} email={ticket.user.email} />
            <Link
              href={`/?userId=${encodeURIComponent(ticket.user.id)}`}
              className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/10"
            >
              Skrzynka: tylko ten klient
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Labelled label="Status" htmlFor={`${fieldsId}-status`}>
            <Select
              id={`${fieldsId}-status`}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-sm max-w-[11rem]"
              value={ticket.status}
              disabled={pending}
              onChange={(v) =>
                patchField({
                  status: v,
                })
              }
              options={STATUS_OPTS.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
            />
          </Labelled>
          <Labelled label="Prio" htmlFor={`${fieldsId}-prio`}>
            <Select
              id={`${fieldsId}-prio`}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-sm max-w-[9rem]"
              value={ticket.priority}
              disabled={pending}
              onChange={(v) => patchField({ priority: v })}
              options={PRI_OPTS.map((p) => ({ value: p, label: etykieta(TICKET_PRIORITY_PL, p) }))}
            />
          </Labelled>
          <Labelled label="Dział" htmlFor={`${fieldsId}-dept`}>
            <Select
              id={`${fieldsId}-dept`}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-sm max-w-[10rem]"
              value={ticket.department}
              disabled={pending}
              onChange={(v) => patchField({ department: v })}
              options={DEPT_OPTS.map((d) => ({ value: d, label: etykieta(TICKET_DEPARTMENT_PL, d) }))}
            />
          </Labelled>
          <Labelled label="Przypisano" htmlFor={`${fieldsId}-assigned`}>
            <Select
              id={`${fieldsId}-assigned`}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-sm min-w-[11rem]"
              value={assignedId ?? ""}
              disabled={pending}
              onChange={(v) => {
                patchField({ assignedToId: v === "" ? null : v });
              }}
              options={[
                { value: "", label: "— nikt —" },
                ...agents.map((a) => ({
                  value: a.id,
                  label: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email,
                })),
              ]}
            />
          </Labelled>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <OpsCard title="SLA">
          <SlaCountdown label="Pierwsza odpowiedź" due={ticket.slaResponseDueAt ?? null} done={Boolean(ticket.firstResponseAt)} />
          <SlaCountdown label="Rozwiązanie" due={ticket.slaResolveDueAt ?? null} done={ticket.status === "CLOSED"} />
          {ticket.waitingSince ? (
            <p className="mt-1 text-xs text-amber-300/90">
              Czeka na klienta od {new Date(ticket.waitingSince).toLocaleString("pl-PL")}
              {ticket.customerReminderSentAt ? " · przypomnienie wysłane" : ""}
            </p>
          ) : null}
          {ticket.autoClosedAt ? (
            <p className="mt-1 text-xs text-neutral-400">Zamknięte automatycznie {new Date(ticket.autoClosedAt).toLocaleString("pl-PL")}</p>
          ) : null}
        </OpsCard>
        <OpsCard title="Runbook">
          <p className="mb-2 text-xs text-neutral-300">{ticket.runbookKey ?? "Brak przypisanego runbooka"}</p>
          <button
            disabled={pending}
            onClick={() =>
              transition(async () => {
                setOpsErr(null);
                const res = await staffApplyRunbook(ticket.id, ticket.department === "BILLING" ? "billing-payment-check" : "hosting-dns-tls-check");
                if ("error" in res) setOpsErr(res.error);
                else router.refresh();
              })
            }
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100"
          >
            Zastosuj rekomendowany
          </button>
        </OpsCard>
        <OpsCard title="Eskalacja / Risk">
          <p className="mb-2 text-xs text-neutral-300">
            {ticket.escalatedAt ? `Eskalowano: ${new Date(ticket.escalatedAt).toLocaleString("pl-PL")}` : "Nieeskalowane"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={pending}
              onClick={() =>
                transition(async () => {
                  setOpsErr(null);
                  const res = await staffEscalateTicket(ticket.id, "Eskalacja z panelu staff: wymagane wsparcie senior/operator node");
                  if ("error" in res) setOpsErr(res.error);
                  else router.refresh();
                })
              }
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100"
            >
              Eskaluj
            </button>
            <button
              disabled={pending}
              onClick={() =>
                transition(async () => {
                  setOpsErr(null);
                  const res = await staffSetRiskFlag(ticket.id, "SUPPORT_RISK", "Wysokie ryzyko retencji lub awarii po sygnałach z ticketu");
                  if ("error" in res) setOpsErr(res.error);
                  else router.refresh();
                })
              }
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100"
            >
              Oznacz risk
            </button>
          </div>
        </OpsCard>
      </div>
      {opsErr ? <p className="text-sm text-rose-300">{opsErr}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <OpsCard title="Checklist runbooka">
          <ul className="space-y-2 text-xs text-neutral-300">
            {runbookChecklist.map((item) => (
              <li key={item} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </OpsCard>
        {context ? (
          <OpsCard title={`Szkic odpowiedzi · ${context.categoryLabel}`}>
            <p className="mb-2 text-xs text-neutral-400">
              Kategoria rozpoznana z treści zgłoszenia, szkic z danych konta i bazy wiedzy. Nic nie wychodzi do klienta, dopóki nie klikniesz „Wyślij odpowiedź”.
            </p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 font-sans text-xs text-neutral-200">
              {context.draft}
            </pre>
            <button
              type="button"
              onClick={() => setReplyText((prev) => (prev ? `${prev}\n\n${context.draft}` : context.draft))}
              className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100"
            >
              Wstaw do odpowiedzi
            </button>
          </OpsCard>
        ) : null}
        {aiConfigured ? (
          <OpsCard title="AI asystent (draft, audytowany)">
            <p className="mb-3 text-xs text-neutral-400">
              AI generuje szkic i checklistę dla operatora. Treść nie jest wysyłana do klienta automatycznie.
            </p>
            <button
              disabled={pending}
              onClick={() =>
                transition(async () => {
                  setOpsErr(null);
                  const res = await staffGenerateAiSuggestion(ticket.id);
                  if ("error" in res) setOpsErr(res.error);
                  else setAiSuggestion(res.suggestion);
                })
              }
              className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100"
            >
              Wygeneruj sugestię AI
            </button>
            {aiSuggestion ? (
              <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-neutral-200">
                {JSON.stringify(aiSuggestion, null, 2)}
              </pre>
            ) : null}
          </OpsCard>
        ) : null}
      </div>

      {ticket.events && ticket.events.length > 0 ? (
        <TicketTimeline events={ticket.events} />
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/25 p-6">
        <h2 className="mb-3 text-sm font-semibold text-white">Pierwsza wiadomość</h2>
        <pre className="font-sans text-sm whitespace-pre-wrap text-neutral-200">{ticket.message}</pre>
        <AttachmentList ticketId={ticket.id} items={openingAttachments(ticket)} />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Wątek</h2>
        <div className="space-y-3">
          {[...ticket.replies]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border px-4 py-3 text-sm ${r.isStaff ? "border-cyan-500/25 bg-cyan-500/[0.07]" : "border-white/10 bg-white/[0.03]"}`}
              >
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{r.isStaff ? "Verris (staff)" : "Klient"}</span>
                  <span>{new Date(r.createdAt).toLocaleString("pl-PL")}</span>
                </div>
                <p className="text-neutral-100 whitespace-pre-wrap">{r.message}</p>
                <AttachmentList ticketId={ticket.id} items={r.attachments ?? []} />
              </div>
            ))}
        </div>

        <form
          encType="multipart/form-data"
          action={async (fd) => {
            setReplyErr(null);
            const r = await staffPostReplyWithFiles(ticket.id, fd);
            if ("error" in r && r.error) setReplyErr(r.error);
            else router.refresh();
          }}
          className="mt-8 space-y-3 border-t border-white/10 pt-6"
        >
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={replyId} className="block text-sm font-medium text-white">Twoja odpowiedź</label>
            <CannedResponsePicker
              canned={canned}
              onInsert={(text) => setReplyText((prev) => (prev ? `${prev}\n\n${text}` : text))}
            />
          </div>
          <textarea
            id={replyId}
            name="message"
            rows={6}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-cyan-500/40"
            placeholder="Napisz odpowiedź — klient dostanie wiadomość e-mailem."
          />
          <div>
            <label htmlFor={filesId} className="mb-2 block text-xs text-muted-foreground">Załączniki (opcjonalnie, max 5 × 8 MB)</label>
            <input
              id={filesId}
              name="files"
              type="file"
              multiple
              className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs file:mr-3 file:rounded-md file:border file:border-white/15 file:bg-white/10 file:px-2 file:py-1"
            />
          </div>
          {replyErr ? <p className="text-sm text-rose-300">{replyErr}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-semibold hover:bg-cyan-500 disabled:opacity-50"
          >
            Wyślij odpowiedź
          </button>
        </form>
      </div>
      </div>
      <div className="xl:sticky xl:top-4 xl:self-start">
        <TicketClientAside context={context} userId={ticket.user.id} />
      </div>
      </div>
    </div>
  );
}

function TicketTimeline({
  events,
}: {
  events: NonNullable<StaffTicketDetail["events"]>;
}) {
  return (
    <OpsCard title="Historia zgłoszenia">
      <ol className="space-y-2">
        {events.map((e) => {
          const meta = e.meta ?? {};
          const from = (meta as { from?: unknown }).from;
          const to = (meta as { to?: unknown }).to;
          const suffix =
            e.type === "STATUS_CHANGED" && (from || to)
              ? ` (${STATUS_LABELS[String(from)] ?? String(from ?? "—")} → ${STATUS_LABELS[String(to)] ?? String(to ?? "—")})`
              : "";
          return (
            <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
              <span className="text-neutral-200">
                {EVENT_LABELS[e.type] ?? e.type}
                <span className="text-neutral-500">{suffix}</span>
              </span>
              <span className="shrink-0 text-neutral-500">{new Date(e.createdAt).toLocaleString("pl-PL")}</span>
            </li>
          );
        })}
      </ol>
    </OpsCard>
  );
}

// Etykieta obok pola (htmlFor), nie owijająca — klik w listę Selecta nie może ponownie aktywować przycisku.
function Labelled({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs uppercase tracking-wide">
      <label htmlFor={htmlFor} className="text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function OpsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

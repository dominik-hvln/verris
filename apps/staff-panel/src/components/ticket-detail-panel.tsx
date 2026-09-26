"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Paperclip, RefreshCw } from "lucide-react";
import type { AgentOption, OcenaAgenta, StaffTicketDetail, TicketAttachmentRow, TicketContext } from "@/lib/tickets-data";
import { Select } from "@/components/select";
import { Karta, TicketClientAside } from "@/components/ticket-client-aside";
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
import { odczytajSugestie, type SugestiaAi } from "@/lib/ai-sugestia";
import { staffTicketAttachmentDownloadHref } from "@/lib/ticket-attachment-links";
import { TICKET_DEPARTMENT_PL, TICKET_PRIORITY_PL, TICKET_STATUS_PL, etykieta } from "@verris/contracts";
import { PoleZalacznikow } from "./pole-zalacznikow";
import { Checkbox } from "./checkbox";

interface Props {
  ticket: StaffTicketDetail;
  agents: AgentOption[];
  context: TicketContext | null;
  mojeOceny: OcenaAgenta | null;
  /** Czas renderu na serwerze — ten sam start zegara po obu stronach (hydracja). */
  teraz: number;
}

const STATUS_OPTS = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "CLOSED"] as const;
const PRI_OPTS = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const DEPT_OPTS = ["BILLING", "TECHNICAL", "SALES"] as const;
const EVENT_LABELS: Record<string, string> = {
  TICKET_CREATED: "Utworzono zgłoszenie",
  CUSTOMER_REPLY: "Odpowiedź klienta",
  STAFF_REPLY: "Odpowiedź obsługi",
  STATUS_CHANGED: "Zmiana stanu",
  ASSIGNMENT_CHANGED: "Zmiana przypisania",
  CUSTOMER_REMINDER_SENT: "Przypomnienie do klienta",
  AUTO_CLOSED: "Zamknięte automatycznie (brak odpowiedzi)",
  SLA_RESPONSE_BREACH_ALERTED: "Alert: pierwsza odpowiedź po terminie",
  ESCALATED: "Eskalacja",
  AUTO_MESSAGE: "Automatyczna wiadomość",
  REOPENED: "Klient otworzył ponownie",
};
const AUTO: Record<string, string> = {
  POTWIERDZENIE: "potwierdzenie",
  ZAJMUJE_SIE: "opiekun się tym zajmuje",
  WCIAZ_PRACUJEMY: "wciąż nad tym pracujemy",
  PODZIEKOWANIE: "podziękowanie i prośba o ocenę",
};
const KATEGORIE = [
  { k: "POWITANIE", nazwa: "Powitanie" },
  { k: "DIAGNOZA", nazwa: "Diagnoza" },
  { k: "OPOZNIENIE", nazwa: "Dłużej niż zwykle" },
  { k: "ZALECENIA", nazwa: "Zalecenia" },
  { k: "ZAMKNIECIE", nazwa: "Zamknięcie" },
] as const;
const NAZWA_KAT: Record<string, string> = Object.fromEntries(KATEGORIE.map((k) => [k.k, k.nazwa]));
/** Godziny na odpowiedź wg priorytetu — to samo co API (połowa = „Wciąż nad tym pracujemy”). */
const SLA_H: Record<string, number> = { URGENT: 1, HIGH: 4, NORMAL: 12, LOW: 24 };

// Czas zawsze polski — serwer (UTC) i przeglądarka pokazują to samo (bez rozjazdu przy hydracji).
const TZ = "Europe/Warsaw";
const fGodz = new Intl.DateTimeFormat("pl-PL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fDzien = new Intl.DateTimeFormat("pl-PL", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const godz = (s: string | Date) => fGodz.format(new Date(s));
const kiedy = (s: string | Date, teraz = Date.now()) => {
  const d = new Date(s);
  return fDzien.format(d) === fDzien.format(teraz) ? godz(d) : `${fDzien.format(d)}, ${godz(d)}`;
};
const osoba = (u: { firstName: string | null; lastName: string | null } | null | undefined) =>
  u?.firstName ? `${u.firstName}${u.lastName ? ` ${u.lastName[0]}.` : ""}` : null;

function formatKb(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 100 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function Zalaczniki({ ticketId, items }: { ticketId: string; items: TicketAttachmentRow[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => (
        <a
          key={a.id}
          href={staffTicketAttachmentDownloadHref(ticketId, a.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-card px-2.5 py-1 text-xs text-foreground no-underline hover:border-primary"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{a.originalName}</span>
          <span className="text-muted-foreground">({formatKb(a.sizeBytes)})</span>
        </a>
      ))}
    </div>
  );
}

function useTeraz(start: number) {
  const [teraz, setTeraz] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setTeraz(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return teraz;
}

function czas(min: number) {
  const m = Math.abs(min);
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} dni`;
}

const PILL: Record<string, string> = {
  ok: "bg-data-soft text-data-hi",
  warn: "bg-warn-soft text-warn",
  crit: "bg-[color-mix(in_srgb,var(--crit)_12%,transparent)] text-crit",
  neu: "bg-raised text-[color:var(--verris-body)]",
};

function Pill({ ton, kropka, children }: { ton: keyof typeof PILL; kropka?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-[7px] rounded-full px-[11px] py-1 text-[13px] font-semibold ${PILL[ton]}`}>
      {kropka ? <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

function Wybor({ etykieta: e, id, children }: { etykieta: string; id: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex h-[34px] items-center rounded-lg border border-line-strong bg-card pl-2.5 text-[13px] font-semibold">
      <label htmlFor={id} className="text-muted-foreground">
        {e}:
      </label>
      {children}
    </div>
  );
}

const POLE_WYBORU = "flex h-[32px] items-center gap-1.5 border-0 bg-transparent px-1.5 text-[13px] font-semibold text-foreground";

export function TicketDetailPanel({ ticket, agents, context, mojeOceny, teraz: start }: Props) {
  const router = useRouter();
  const teraz = useTeraz(start);
  const kd = (d: string | Date) => kiedy(d, teraz);
  const [pending, transition] = useTransition();
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const [opsErr, setOpsErr] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [szkicNowy, setSzkicNowy] = useState<SugestiaAi | null>(null);
  const [replyText, setReplyText] = useState("");
  const [uzyte, setUzyte] = useState<string[]>([]);
  const [canned, setCanned] = useState<CannedResponseRow[]>([]);
  const [zakladka, setZakladka] = useState<"szkic" | "szablony" | "wiedza">("szkic");
  const [katFiltr, setKatFiltr] = useState<string | null>(null);
  const [szukaj, setSzukaj] = useState("");
  const czekajRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const replyId = useId();
  const filesId = useId();
  const fieldsId = useId();

  // SUP-2 — szablony z podstawionymi zmiennymi (API), posortowane pod temat zgłoszenia.
  useEffect(() => {
    void staffFetchCanned(ticket.topic ?? undefined, undefined, ticket.id).then(setCanned);
  }, [ticket.topic, ticket.id]);

  useEffect(() => {
    let active = true;
    staffGetAiStatus()
      .then((s) => active && setAiConfigured(s.configured))
      .catch(() => active && setAiConfigured(false));
    return () => {
      active = false;
    };
  }, []);

  const assignedId = ticket.assignedToId ?? ticket.assignedTo?.id ?? "";
  const opiekun = osoba(ticket.assignedTo) ?? "bez opiekuna";

  // PB-37 — szkic asystenta przygotowany w tle (API), albo świeży po kliknięciu.
  const szkic: SugestiaAi | null = useMemo(() => {
    if (szkicNowy) return szkicNowy;
    if (!ticket.aiDraft) return null;
    try {
      return odczytajSugestie(JSON.parse(ticket.aiDraft));
    } catch {
      return odczytajSugestie(ticket.aiDraft);
    }
  }, [szkicNowy, ticket.aiDraft]);

  const wstaw = (tekst: string, etykieta?: string) => {
    setReplyText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${tekst}` : tekst));
    if (etykieta) setUzyte((u) => (u.includes(etykieta) ? u : [...u, etykieta]));
  };

  // „/skrót ” w polu odpowiedzi wstawia szablon (np. /witaj, /dluzej).
  const naZmiane = (v: string) => {
    const m = /(^|\s)\/([\p{L}0-9-]+)\s$/u.exec(v);
    const t = m ? canned.find((c) => c.shortcut === m[2]) : undefined;
    if (m && t) {
      setReplyText(v.slice(0, v.length - m[2].length - 2) + t.content);
      setUzyte((u) => [...u, NAZWA_KAT[t.category ?? ""] ?? t.title].filter((x, i, a) => a.indexOf(x) === i));
    } else setReplyText(v);
  };

  function patchField(patch: Partial<{ status: string; priority: string; department: string; assignedToId: string | null }>) {
    transition(async () => {
      await staffUpdateTicket(ticket.id, patch);
      router.refresh();
    });
  }

  function operacja(fn: () => Promise<{ error: string } | object>) {
    transition(async () => {
      setOpsErr(null);
      const res = await fn();
      if ("error" in res) setOpsErr((res as { error: string }).error);
      else router.refresh();
    });
  }

  // ---- terminy (SLA)
  const pierwszaMin = ticket.slaResponseDueAt ? Math.round((new Date(ticket.slaResponseDueAt).getTime() - teraz) / 60000) : null;
  const rozwMin = ticket.slaResolveDueAt ? Math.round((new Date(ticket.slaResolveDueAt).getTime() - teraz) / 60000) : null;
  const zamkniete = ticket.status === "CLOSED";

  // ---- co widzi klient
  const ostatniaKlienta = [ticket.createdAt, ...ticket.replies.filter((r) => !r.isStaff).map((r) => r.createdAt)].sort().at(-1)!;
  const przeczytane = ticket.staffReadAt && new Date(ticket.staffReadAt) >= new Date(ostatniaKlienta) ? ticket.staffReadAt : null;
  const czekaNaNas = !zamkniete && ticket.status !== "WAITING_CUSTOMER" && ticket.lastReplyIsStaff !== true;
  const nastepnaAuto = (() => {
    if (!czekaNaNas) return null;
    const od = new Date(ticket.lastReplyAt ?? ticket.createdAt).getTime();
    const kiedyAuto = od + ((SLA_H[ticket.priority] ?? 12) / 2) * 3_600_000;
    const ostatnia = ticket.progressNoticeAt ? new Date(ticket.progressNoticeAt).getTime() : 0;
    return Math.max(kiedyAuto, ostatnia + 86_400_000);
  })();

  // ---- szablony
  const dlaSytuacji = KATEGORIE.map((k) => canned.find((c) => c.category === k.k)).filter((c): c is CannedResponseRow => !!c);
  const listaSzablonow = canned.filter(
    (c) =>
      (!katFiltr || c.category === katFiltr) &&
      (!szukaj.trim() || [c.title, c.content, c.shortcut ?? ""].join(" ").toLowerCase().includes(szukaj.trim().toLowerCase())),
  );

  const watek = [...ticket.replies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const nazwaKlienta = [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ") || ticket.user.email;

  return (
    <div className="grid gap-[22px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* ---------- nagłówek */}
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Zgłoszenie #{ticket.id.slice(0, 8)} · dział {etykieta(TICKET_DEPARTMENT_PL, ticket.department).toLowerCase()} · od {kd(ticket.createdAt)}
          </span>
          <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.02em]">{ticket.subject}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {ticket.firstResponseAt ? (
              <Pill ton="ok" kropka>Pierwsza odpowiedź: w terminie</Pill>
            ) : pierwszaMin == null ? null : pierwszaMin < 0 ? (
              <Pill ton="crit" kropka>Pierwsza odpowiedź: {czas(pierwszaMin)} po terminie</Pill>
            ) : (
              <Pill ton={pierwszaMin < 60 ? "warn" : "ok"} kropka>
                Pierwsza odpowiedź do {godz(ticket.slaResponseDueAt!)} (za {czas(pierwszaMin)})
              </Pill>
            )}
            {rozwMin != null ? (
              <Pill ton={zamkniete ? "ok" : rozwMin < 0 ? "crit" : "neu"}>
                {zamkniete ? "Rozwiązane" : rozwMin < 0 ? `Rozwiązanie: ${czas(rozwMin)} po terminie` : `Rozwiązanie do ${kd(ticket.slaResolveDueAt!)}`}
              </Pill>
            ) : null}
            {ticket.escalatedAt ? <Pill ton="warn">Eskalowane</Pill> : null}
            {ticket.riskFlag ? <Pill ton="crit">Ryzyko: {ticket.riskFlag}</Pill> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Wybor etykieta="Stan" id={`${fieldsId}-status`}>
              <Select
                id={`${fieldsId}-status`}
                className={POLE_WYBORU}
                value={ticket.status}
                disabled={pending}
                onChange={(v) => patchField({ status: v })}
                options={STATUS_OPTS.map((s) => ({ value: s, label: TICKET_STATUS_PL[s] ?? s }))}
              />
            </Wybor>
            <Wybor etykieta="Priorytet" id={`${fieldsId}-prio`}>
              <Select
                id={`${fieldsId}-prio`}
                className={POLE_WYBORU}
                value={ticket.priority}
                disabled={pending}
                onChange={(v) => patchField({ priority: v })}
                options={PRI_OPTS.map((p) => ({ value: p, label: etykieta(TICKET_PRIORITY_PL, p) }))}
              />
            </Wybor>
            <Wybor etykieta="Dział" id={`${fieldsId}-dept`}>
              <Select
                id={`${fieldsId}-dept`}
                className={POLE_WYBORU}
                value={ticket.department}
                disabled={pending}
                onChange={(v) => patchField({ department: v })}
                options={DEPT_OPTS.map((d) => ({ value: d, label: etykieta(TICKET_DEPARTMENT_PL, d) }))}
              />
            </Wybor>
            <Wybor etykieta="Przypisane" id={`${fieldsId}-assigned`}>
              <Select
                id={`${fieldsId}-assigned`}
                className={POLE_WYBORU}
                value={assignedId}
                disabled={pending}
                onChange={(v) => patchField({ assignedToId: v === "" ? null : v })}
                options={[
                  { value: "", label: "nikt" },
                  ...agents.map((a) => ({ value: a.id, label: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email })),
                ]}
              />
            </Wybor>
          </div>
          <p className="text-[13.5px] text-muted-foreground">
            {nazwaKlienta} · <a href={`mailto:${ticket.user.email}`}>{ticket.user.email}</a> ·{" "}
            <Link href={`/?userId=${encodeURIComponent(ticket.user.id)}`}>wszystkie zgłoszenia tego klienta</Link>
          </p>
        </div>

        {/* ---------- wątek */}
        <section className="flex flex-col gap-2.5" aria-label="Wątek">
          <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-card px-4 py-3.5 text-[14.5px] leading-[1.55]">
            <div className="flex items-baseline gap-2">
              <b>{nazwaKlienta}</b>
              <span className="text-[12.5px] text-muted-foreground">klient · {kd(ticket.createdAt)}</span>
            </div>
            <span className="whitespace-pre-wrap">{ticket.message}</span>
            <Zalaczniki ticketId={ticket.id} items={(ticket.attachments ?? []).filter((a) => a.replyId == null)} />
          </div>
          {watek.map((r) =>
            r.automatic ? (
              <div key={r.id} className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-line-strong bg-raised/60 px-3.5 py-[9px] text-[13px] text-[color:var(--verris-body)]">
                <span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-raised text-xs">
                  {r.automatic === "PODZIEKOWANIE" ? "♥" : r.automatic === "WCIAZ_PRACUJEMY" ? "↻" : "✓"}
                </span>
                <span className="min-w-0 flex-1">
                  <b>Automatycznie · {kd(r.createdAt)}</b> — {AUTO[r.automatic] ?? r.automatic}: „{r.message}”
                </span>
                <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">e-mail + panel</span>
              </div>
            ) : (
              <div
                key={r.id}
                className={`flex flex-col gap-2 rounded-[10px] border px-4 py-3.5 text-[14.5px] leading-[1.55] ${
                  r.isStaff ? "border-data/25 bg-data-soft/60" : "border-line bg-card"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <b>{r.isStaff ? `Verris — ${agents.find((a) => a.id === r.authorId)?.firstName ?? "obsługa"}` : nazwaKlienta}</b>
                  <span className="text-[12.5px] text-muted-foreground">
                    {r.isStaff ? "obsługa" : "klient"} · {kd(r.createdAt)}
                  </span>
                </div>
                <span className="whitespace-pre-wrap">{r.message}</span>
                <Zalaczniki ticketId={ticket.id} items={r.attachments ?? []} />
              </div>
            ),
          )}
        </section>

        {/* ---------- odpowiedź + podpowiedzi */}
        <section className="grid overflow-hidden rounded-[10px] border border-line bg-card lg:grid-cols-[minmax(0,1fr)_330px]" aria-label="Odpowiedź i podpowiedzi">
          <form
            ref={formRef}
            action={async (fd) => {
              setReplyErr(null);
              const r = await staffPostReplyWithFiles(ticket.id, fd);
              if ("error" in r && r.error) setReplyErr(r.error);
              else {
                setReplyText("");
                setUzyte([]);
                router.refresh();
              }
            }}
            className="flex flex-col gap-2.5 border-line p-4 lg:border-r"
          >
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={replyId} className="text-[15px] font-bold">
                Twoja odpowiedź
              </label>
              <span className="ml-auto text-[12.5px] text-muted-foreground">
                wpisz <kbd className="rounded-[5px] border border-line-strong bg-card px-1.5 py-px font-mono text-[11px]">/skrót</kbd> żeby wstawić szablon
              </span>
            </div>
            <textarea
              id={replyId}
              name="message"
              rows={9}
              value={replyText}
              onChange={(e) => naZmiane(e.target.value)}
              placeholder="Napisz odpowiedź — klient dostanie ją e-mailem i zobaczy w panelu."
              className="min-h-[180px] resize-y rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-[14.5px] leading-[1.55] text-foreground outline-none focus:border-data"
            />
            {uzyte.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {uzyte.map((u) => (
                  <span key={u} className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold text-[color:var(--verris-body)]">
                    {u}
                  </span>
                ))}
                <span className="text-xs text-muted-foreground">— użyte w tej odpowiedzi</span>
              </div>
            ) : null}
            <div>
              <label htmlFor={filesId} className="mb-1.5 block text-xs text-muted-foreground">
                Załączniki (opcjonalnie, do 5 × 8 MB)
              </label>
              <PoleZalacznikow id={filesId} name="files" />
            </div>
            <input ref={czekajRef} type="hidden" name="czekaj" defaultValue="tak" />
            {replyErr ? (
              <p role="alert" className="text-sm text-crit">
                {replyErr}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="submit"
                disabled={pending}
                onClick={() => czekajRef.current && (czekajRef.current.value = "nie")}
                title="Sprawa zostaje u nas (W realizacji)"
                className="inline-flex h-[38px] items-center rounded-[9px] border border-line-strong bg-card px-3.5 text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50"
              >
                Wyślij
              </button>
              <button
                type="submit"
                disabled={pending}
                onClick={() => czekajRef.current && (czekajRef.current.value = "tak")}
                className="inline-flex h-[38px] items-center rounded-[9px] border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:opacity-50"
              >
                Wyślij i czekaj na klienta
              </button>
            </div>
          </form>

          <div className="flex flex-col bg-raised/40" aria-labelledby="podp">
            <div className="flex items-center px-3.5 pt-3">
              <h2 id="podp" className="font-display text-[15px] font-bold">
                Podpowiedzi
              </h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">asystent · baza</span>
            </div>
            <div className="flex gap-1 border-b border-line px-3.5 pt-2.5" role="tablist" aria-label="Podpowiedzi">
              {(
                [
                  ["szkic", "Szkic"],
                  ["szablony", "Szablony"],
                  ["wiedza", "Baza wiedzy"],
                ] as const
              ).map(([k, n]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={zakladka === k}
                  onClick={() => setZakladka(k)}
                  className={`border-b-2 px-2.5 py-[7px] text-[13px] font-semibold ${zakladka === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {n}
                </button>
              ))}
            </div>

            {zakladka === "szkic" ? (
              <>
                <div className="flex flex-col gap-2 border-b border-line px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-data-hi">
                      {szkic?.szkic ? `Asystent · gotowy${ticket.aiDraftAt && !szkicNowy ? ` ${kd(ticket.aiDraftAt)}` : ""}` : context ? "Szkic z danych konta" : "Asystent"}
                    </span>
                    <span className="ml-auto text-[11.5px] text-muted-foreground">do sprawdzenia</span>
                  </div>
                  {szkic?.szkic ? (
                    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.5]">{szkic.szkic}</p>
                  ) : context?.draft ? (
                    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.5]">{context.draft}</p>
                  ) : (
                    <p className="text-[13.5px] text-muted-foreground">
                      {aiConfigured ? "Szkic pojawi się po pierwszej wiadomości klienta — albo przygotuj go teraz." : "Asystent nie jest skonfigurowany — użyj szablonów."}
                    </p>
                  )}
                  {szkic?.checklista.length ? (
                    <div>
                      <p className="text-xs font-semibold">Sprawdź przed wysłaniem</p>
                      <ul className="list-disc pl-4 text-[12.5px] text-[color:var(--verris-body)]">
                        {szkic.checklista.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {szkic?.reszta ? <pre className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{szkic.reszta}</pre> : null}
                  <div className="flex flex-wrap gap-1.5">
                    {szkic?.szkic || context?.draft ? (
                      <button
                        type="button"
                        onClick={() => wstaw(szkic?.szkic ?? context!.draft, szkic?.szkic ? "Szkic asystenta" : "Szkic z danych konta")}
                        className="inline-flex h-[30px] items-center rounded-[9px] border border-primary bg-primary px-2.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-data-hi"
                      >
                        Wstaw szkic
                      </button>
                    ) : null}
                    {aiConfigured ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          transition(async () => {
                            setOpsErr(null);
                            const res = await staffGenerateAiSuggestion(ticket.id);
                            if ("error" in res) setOpsErr(res.error);
                            else setSzkicNowy(odczytajSugestie(res.suggestion));
                          })
                        }
                        className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border border-line-strong bg-card px-2.5 text-[12.5px] font-semibold text-foreground hover:border-primary disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {szkic?.szkic ? "Odśwież szkic" : "Przygotuj szkic"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="px-3.5 pb-1 pt-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Szablony dla tej sytuacji</div>
                {dlaSytuacji.length === 0 ? <p className="px-3.5 py-2 text-[12.5px] text-muted-foreground">Brak szablonów z kategorią — dodaje je administrator.</p> : null}
                {dlaSytuacji.map((t) => (
                  <Szablon key={t.id} t={t} onWstaw={() => wstaw(t.content, NAZWA_KAT[t.category ?? ""] ?? t.title)} />
                ))}
                {context?.kb.length ? (
                  <div className="flex flex-col gap-1 px-3.5 pb-3 pt-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Baza wiedzy</span>
                    {context.kb.slice(0, 3).map((k) => (
                      <a key={k.url} href={k.url} target="_blank" rel="noreferrer" className="text-[13px]">
                        {k.title}
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {zakladka === "szablony" ? (
              <div className="flex flex-col">
                <div className="flex flex-col gap-2 px-3.5 py-3">
                  <input
                    value={szukaj}
                    onChange={(e) => setSzukaj(e.target.value)}
                    aria-label="Szukaj szablonu"
                    placeholder="Szukaj szablonu…"
                    className="h-[34px] rounded-lg border border-line-strong bg-card px-2.5 text-[13px] text-foreground outline-none focus:border-data"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[{ k: null as string | null, nazwa: "Wszystkie" }, ...KATEGORIE].map((k) => (
                      <button
                        key={k.nazwa}
                        type="button"
                        aria-pressed={katFiltr === k.k}
                        onClick={() => setKatFiltr(k.k)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${katFiltr === k.k ? "bg-primary text-primary-foreground" : "bg-raised text-[color:var(--verris-body)]"}`}
                      >
                        {k.nazwa}
                      </button>
                    ))}
                  </div>
                </div>
                {listaSzablonow.map((t) => (
                  <Szablon key={t.id} t={t} tytul onWstaw={() => wstaw(t.content, NAZWA_KAT[t.category ?? ""] ?? t.title)} />
                ))}
                {listaSzablonow.length === 0 ? <p className="px-3.5 py-3 text-[12.5px] text-muted-foreground">Brak pasujących szablonów.</p> : null}
              </div>
            ) : null}

            {zakladka === "wiedza" ? (
              <div className="flex flex-col gap-1.5 px-3.5 py-3">
                {context?.kb.length ? (
                  context.kb.map((k) => (
                    <a key={k.url} href={k.url} target="_blank" rel="noreferrer" className="text-[13.5px]">
                      {k.title}
                    </a>
                  ))
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">Brak artykułów pasujących do tego zgłoszenia.</p>
                )}
                {context ? <p className="mt-1 text-xs text-muted-foreground">Kategoria rozpoznana z treści: {context.categoryLabel}.</p> : null}
                <Link href="/knowledge" className="mt-1 text-[13px]">
                  Cała baza wiedzy →
                </Link>
              </div>
            ) : null}
          </div>
        </section>
        {opsErr ? (
          <p role="alert" className="text-sm text-crit">
            {opsErr}
          </p>
        ) : null}
      </div>

      {/* ---------- kolumna boczna */}
      <aside className="flex flex-col gap-4 xl:sticky xl:top-[86px] xl:self-start">
        <TicketClientAside context={context} userId={ticket.user.id} email={ticket.user.email} />

        <Karta>
          <div className="flex flex-col gap-[9px] px-4 py-3.5">
            <h2 className="font-display text-[15px] font-bold">Co widzi klient</h2>
            <Krok stan="done">Przyjęte · {kd(ticket.createdAt)}</Krok>
            <Krok stan={assignedId ? "done" : "todo"}>Opiekun: {opiekun}</Krok>
            <Krok stan={przeczytane ? "done" : "todo"}>{przeczytane ? `Przeczytane · ${kd(przeczytane)}` : "Jeszcze nie przeczytane przez opiekuna"}</Krok>
            <Krok stan={zamkniete ? "done" : "now"}>
              {zamkniete ? "Rozwiązane" : ticket.status === "WAITING_CUSTOMER" ? "Czekamy na odpowiedź klienta" : "Czeka na naszą odpowiedź"}
            </Krok>
            <Krok stan={ticket.csatAt ? "done" : "todo"}>{ticket.csatAt ? "Ocena wystawiona" : "Rozwiązane → podziękowanie i ocena"}</Krok>
            {nastepnaAuto ? (
              <p className="mt-1 rounded-lg bg-warn-soft px-2.5 py-[9px] text-[12.5px] leading-[1.45] text-warn">
                {nastepnaAuto <= teraz ? "Klient zaraz dostanie" : <>Bez odpowiedzi do <b>{kd(new Date(nastepnaAuto))}</b> klient dostanie</>} „Wciąż nad tym pracujemy”, a Ty przypomnienie.
              </p>
            ) : ticket.status === "WAITING_CUSTOMER" && ticket.waitingSince ? (
              <p className="mt-1 rounded-lg bg-raised px-2.5 py-[9px] text-[12.5px] leading-[1.45] text-[color:var(--verris-body)]">
                Czekamy od {kd(ticket.waitingSince)}.{" "}
                {ticket.customerReminderSentAt ? "Przypomnienie wysłane — " : "Przypomnienie po 2 dniach, "}zamknięcie po 5 dniach bez odpowiedzi.
              </p>
            ) : ticket.autoClosedAt ? (
              <p className="mt-1 text-[12.5px] text-muted-foreground">Zamknięte automatycznie {kd(ticket.autoClosedAt)}.</p>
            ) : null}
          </div>
        </Karta>

        {ticket.csatAt ? (
          <Karta>
            <div className="flex flex-col gap-1.5 px-4 py-3.5 text-[13.5px]">
              <h2 className="font-display text-[15px] font-bold">Ocena klienta</h2>
              <span>
                Opiekun: <b>{ticket.agentRating ?? "—"}/5</b> · obsługa: <b>{ticket.csatRating ?? "—"}/5</b>
              </span>
              <span className="text-muted-foreground">
                Problem rozwiązany: {ticket.csatResolved == null ? "—" : ticket.csatResolved ? "tak" : "nie"}
              </span>
              {ticket.csatComment ? <span className="italic">„{ticket.csatComment}”</span> : null}
            </div>
          </Karta>
        ) : null}

        <Karta>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="font-display text-[26px] font-extrabold">{mojeOceny?.opiekun?.toLocaleString("pl-PL") ?? "—"}</span>
            <span className="flex flex-col text-[12.5px]">
              <b className="text-[13.5px]">Twoje oceny · 30 dni</b>
              <span className="text-muted-foreground">
                {mojeOceny
                  ? `obsługa ${mojeOceny.support?.toLocaleString("pl-PL") ?? "—"} · rozwiązane ${mojeOceny.rozwiazanePct ?? "—"}% · ${mojeOceny.ocen} ocen`
                  : "jeszcze bez ocen"}
              </span>
            </span>
          </div>
        </Karta>

        <Karta>
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <h2 className="font-display text-[15px] font-bold">Lista kontrolna</h2>
            {(ticket.department === "BILLING"
              ? ["Status ostatniej faktury i płatności", "Portfel i metoda płatności", "Jasny termin dla klienta"]
              : ["Przyczyna w logu / zdarzeniach usługi", "Strona znów działa", "Klient wie, co dalej"]
            ).map((x) => (
              <label key={x} className="flex items-center gap-2 text-[13.5px]">
                <Checkbox /> {x}
              </label>
            ))}
            <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
              <span className="text-[12.5px] text-muted-foreground">Runbook: {ticket.runbookKey ?? "brak"}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => operacja(() => staffApplyRunbook(ticket.id, ticket.department === "BILLING" ? "billing-payment-check" : "hosting-dns-tls-check"))}
                className="ml-auto inline-flex h-8 items-center rounded-[9px] border border-line-strong bg-card px-2.5 text-[12.5px] font-semibold text-foreground hover:border-primary disabled:opacity-50"
              >
                Zastosuj zalecany
              </button>
            </div>
          </div>
        </Karta>

        <Karta>
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <h2 className="font-display text-[15px] font-bold">Eskalacja i ryzyko</h2>
            <p className="text-[13px] text-muted-foreground">
              {ticket.escalatedAt ? `Eskalowano ${kd(ticket.escalatedAt)}${ticket.escalationReason ? ` — ${ticket.escalationReason}` : ""}` : "Nieeskalowane"}
              {ticket.riskFlag ? ` · ryzyko: ${ticket.riskReason ?? ticket.riskFlag}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => operacja(() => staffEscalateTicket(ticket.id, "Eskalacja z panelu obsługi: wymagane wsparcie seniora / operatora węzła"))}
                className="inline-flex h-8 items-center rounded-[9px] border border-warn/40 bg-warn-soft px-2.5 text-[12.5px] font-semibold text-warn disabled:opacity-50"
              >
                Eskaluj
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => operacja(() => staffSetRiskFlag(ticket.id, "SUPPORT_RISK", "Wysokie ryzyko odejścia lub awarii po sygnałach ze zgłoszenia"))}
                className="inline-flex h-8 items-center rounded-[9px] border border-crit/40 bg-[color-mix(in_srgb,var(--crit)_10%,transparent)] px-2.5 text-[12.5px] font-semibold text-crit disabled:opacity-50"
              >
                Oznacz ryzyko
              </button>
            </div>
          </div>
        </Karta>

        {ticket.events?.length ? (
          <Karta>
            <details className="px-4 py-3.5">
              <summary className="cursor-pointer font-display text-[15px] font-bold">Historia zgłoszenia ({ticket.events.length})</summary>
              <ol className="mt-2 flex flex-col gap-1.5">
                {ticket.events.map((e) => {
                  const meta = (e.meta ?? {}) as { from?: unknown; to?: unknown; rodzaj?: unknown };
                  const dodatek =
                    e.type === "STATUS_CHANGED"
                      ? ` (${TICKET_STATUS_PL[String(meta.from)] ?? String(meta.from ?? "—")} → ${TICKET_STATUS_PL[String(meta.to)] ?? String(meta.to ?? "—")})`
                      : e.type === "AUTO_MESSAGE"
                        ? `: ${AUTO[String(meta.rodzaj)] ?? String(meta.rodzaj ?? "")}`
                        : "";
                  return (
                    <li key={e.id} className="flex justify-between gap-3 text-[12.5px]">
                      <span>
                        {EVENT_LABELS[e.type] ?? e.type}
                        <span className="text-muted-foreground">{dodatek}</span>
                      </span>
                      <span className="shrink-0 font-mono text-muted-foreground">{kd(e.createdAt)}</span>
                    </li>
                  );
                })}
              </ol>
            </details>
          </Karta>
        ) : null}
      </aside>
    </div>
  );
}

function Szablon({ t, onWstaw, tytul }: { t: CannedResponseRow; onWstaw: () => void; tytul?: boolean }) {
  return (
    <button
      type="button"
      onClick={onWstaw}
      title="Wstaw do odpowiedzi"
      className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 border-t border-line px-3.5 py-2 text-left hover:bg-raised"
    >
      <span className={`text-xs font-bold ${t.category === "OPOZNIENIE" ? "text-warn" : "text-data-hi"}`}>
        {tytul ? t.title : NAZWA_KAT[t.category ?? ""] ?? t.title}
      </span>
      {t.shortcut ? (
        <kbd className="row-span-2 self-center rounded-[5px] border border-line-strong bg-card px-1.5 py-px font-mono text-[11px] text-muted-foreground">/{t.shortcut}</kbd>
      ) : (
        <span className="row-span-2" />
      )}
      <span className="line-clamp-1 text-[12.5px] text-[color:var(--verris-body)]">{t.content.replace(/\s+/g, " ")}</span>
    </button>
  );
}

function Krok({ stan, children }: { stan: "done" | "now" | "todo"; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-[9px] text-[13.5px] ${stan === "todo" ? "text-muted-foreground" : stan === "now" ? "font-semibold" : ""}`}>
      <span
        aria-hidden
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] ${
          stan === "done" ? "border-verris-green bg-verris-green text-verris-paper" : stan === "now" ? "border-verris-green text-verris-green" : "border-line-strong"
        }`}
      >
        {stan === "done" ? "✓" : stan === "now" ? "•" : ""}
      </span>
      {children}
    </div>
  );
}

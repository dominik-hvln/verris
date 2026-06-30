"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Send,
  Clock,
  XCircle,
  Users2,
} from "lucide-react";
import type { CampaignRow, CampaignStatus, MarketingSegment } from "./data";
import {
  createCampaignAction,
  scheduleCampaignAction,
  cancelCampaignAction,
} from "./actions";
import { estimateSegment } from "./data";

const SEGMENTS: { value: MarketingSegment; label: string; hint: string }[] = [
  {
    value: "NEWSLETTER_OPT_IN",
    label: "Zgoda na newsletter",
    hint: "Klienci z aktywną zgodą marketingową (z rejestracji lub ustawień). Domyślny dla mailingu.",
  },
  {
    value: "PRODUCT_UPDATES_OPT_IN",
    label: "Zgoda na nowości produktowe",
    hint: "Klienci z opt-inem na nowości. Do informacji o funkcjach.",
  },
  {
    value: "ALL_ACTIVE_USERS",
    label: "Wszyscy aktywni (tylko legal/ważne)",
    hint: "UWAGA: ignoruje opt-in. Używaj WYŁĄCZNIE do komunikatów transakcyjnych (np. zmiana cennika, wymóg prawny), nie do marketingu.",
  },
];

export function MarketingClient({ rows }: { rows: CampaignRow[] }) {
  return (
    <div className="space-y-8">
      <CreateCampaignForm />
      <CampaignList rows={rows} />
    </div>
  );
}

function CreateCampaignForm() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [segment, setSegment] = useState<MarketingSegment>("NEWSLETTER_OPT_IN");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    setEstimate(null);
    estimateSegment(segment)
      .then((r) => active && setEstimate(r.count))
      .catch(() => active && setEstimate(null));
    return () => {
      active = false;
    };
  }, [segment]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await createCampaignAction({
        name,
        subject,
        bodyMarkdown: body,
        ctaLabel: ctaLabel || undefined,
        ctaUrl: ctaUrl || undefined,
        segment,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Kampania „${name}" zapisana jako szkic. Zatwierdź wysyłkę na liście poniżej.`);
      setName("");
      setSubject("");
      setBody("");
      setCtaLabel("");
      setCtaUrl("");
    });
  };

  const seg = SEGMENTS.find((s) => s.value === segment)!;

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4"
    >
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <Plus className="h-5 w-5 text-indigo-400" />
        Nowa kampania
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nazwa (wewnętrzna)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Newsletter czerwiec 2026"
            className="input"
          />
        </Field>
        <Field label="Temat maila">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Co słychać w Verris?"
            className="input"
          />
        </Field>
      </div>

      <Field label="Treść (Markdown)">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder={"## Cześć!\n\nMamy dla Ciebie kilka nowości...\n\n- Punkt pierwszy\n- Punkt drugi"}
          className="input font-mono text-xs leading-relaxed"
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Etykieta przycisku (opcjonalnie)">
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Zobacz w panelu"
            className="input"
          />
        </Field>
        <Field label="Link przycisku (opcjonalnie)">
          <input
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://panel.verris.pl/..."
            className="input"
          />
        </Field>
      </div>

      <Field label="Lista odbiorców (segment)">
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value as MarketingSegment)}
          className="input"
        >
          {SEGMENTS.map((s) => (
            <option key={s.value} value={s.value} className="bg-neutral-900">
              {s.label}
            </option>
          ))}
        </select>
        <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
          <Users2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {seg.hint}{" "}
            {estimate != null ? (
              <span className="text-indigo-300 font-semibold">
                Aktualnie {estimate} odbiorców.
              </span>
            ) : (
              <span className="opacity-60">Liczę odbiorców…</span>
            )}
          </span>
        </div>
      </Field>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Zapisz szkic
      </button>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.3);
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          color: white;
          outline: none;
        }
        :global(.input:focus) {
          border-color: rgba(99, 102, 241, 0.6);
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function CampaignList({ rows }: { rows: CampaignRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <Send className="h-10 w-10 mx-auto text-muted-foreground" />
        <h3 className="mt-4 text-base font-bold text-white">Brak kampanii</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Utwórz pierwszą kampanię powyżej — pojawi się tu z możliwością wysyłki.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <CampaignCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function CampaignCard({ row }: { row: CampaignRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Błąd");
    });
  };

  const canSend = row.status === "DRAFT" || row.status === "SCHEDULED";
  const canCancel = row.status === "DRAFT" || row.status === "SCHEDULED";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white truncate">{row.name}</h3>
            <StatusBadge status={row.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{row.subject}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>Segment: {segmentLabel(row.segment)}</span>
            <span>Odbiorcy: {row.recipientCount || "—"}</span>
            <span className="text-emerald-300">Wysłane: {row.sentCount}</span>
            {row.suppressedCount > 0 ? <span className="text-amber-300">Wypisani: {row.suppressedCount}</span> : null}
            {row.failedCount > 0 ? <span className="text-rose-300">Błędy: {row.failedCount}</span> : null}
            {row.scheduledAt ? (
              <span>Plan: {new Date(row.scheduledAt).toLocaleString("pl-PL")}</span>
            ) : null}
          </div>
        </div>
      </div>

      {canSend ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
          <button
            onClick={() => act(() => scheduleCampaignAction(row.id, null))}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Wyślij teraz
          </button>
          <div className="flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
            />
            <button
              onClick={() =>
                when && act(() => scheduleCampaignAction(row.id, new Date(when).toISOString()))
              }
              disabled={pending || !when}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-50"
            >
              <Clock className="h-3.5 w-3.5" />
              Zaplanuj
            </button>
          </div>
          {canCancel ? (
            <button
              onClick={() => act(() => cancelCampaignAction(row.id))}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Odwołaj
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-rose-300">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

function segmentLabel(s: MarketingSegment): string {
  return SEGMENTS.find((x) => x.value === s)?.label ?? s;
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { label: string; cls: string }> = {
    DRAFT: { label: "Szkic", cls: "bg-neutral-500/10 text-neutral-300 border-neutral-500/30" },
    SCHEDULED: { label: "Zaplanowana", cls: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
    SENDING: { label: "Wysyłka…", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
    SENT: { label: "Wysłana", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
    FAILED: { label: "Błąd", cls: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
    CANCELED: { label: "Odwołana", cls: "bg-neutral-500/10 text-neutral-400 border-neutral-500/30" },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>
      {m.label}
    </span>
  );
}

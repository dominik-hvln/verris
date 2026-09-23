"use client";

import { useState, useTransition } from "react";
import {
  createAnnouncementAction,
  createMaintenanceAction,
  setAnnouncementStatusAction,
  setMaintenanceStatusAction,
} from "./actions";
import type { MaintenanceWindowRow, ProductAnnouncementRow } from "./data";

const INPUT =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-400 focus:outline-none";
const BTN = "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50";
const BTN_MAIN =
  "rounded-lg border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-50";

const KINDS: Array<[string, string]> = [
  ["PRODUCT_UPDATE", "Nowość w produkcie"],
  ["CHANGELOG", "Zmiany (changelog)"],
  ["MAINTENANCE", "Prace serwisowe"],
  ["INCIDENT_NOTICE", "Komunikat o awarii"],
  ["PROMOTION", "Promocja"],
];
const kindLabel = (k: string) => KINDS.find(([v]) => v === k)?.[1] ?? k;
const ANN_STATUS: Record<string, string> = { DRAFT: "szkic", SCHEDULED: "zaplanowane", PUBLISHED: "opublikowane", ARCHIVED: "w archiwum" };
const MW_STATUS: Record<string, string> = { SCHEDULED: "zaplanowane", IN_PROGRESS: "w toku", COMPLETED: "zakończone", CANCELED: "odwołane" };
const fmt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function useAkcja() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else onOk?.();
    });
  return { pending, error, run };
}

function Blad({ text }: { text: string | null }) {
  return text ? <p className="text-xs text-rose-300">{text}</p> : null;
}

/** N-11 — ogłoszenia: klient widzi opublikowane w panelu przez 30 dni, archiwizacja zdejmuje od razu. */
export function Announcements({ rows }: { rows: ProductAnnouncementRow[] }) {
  const a = useAkcja();
  const [f, setF] = useState({ kind: "PRODUCT_UPDATE", title: "", bodyMarkdown: "", publishNow: true });
  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() => createAnnouncementAction(f), () => setF({ ...f, title: "", bodyMarkdown: "" }));
        }}
      >
        <select id="ann-kind" aria-label="Rodzaj" className={INPUT} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input id="ann-title" aria-label="Tytuł" required maxLength={160} placeholder="Tytuł" className={INPUT} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea id="ann-body" aria-label="Treść" required maxLength={12000} rows={3} placeholder="Treść widoczna dla klienta" className={INPUT} value={f.bodyMarkdown} onChange={(e) => setF({ ...f, bodyMarkdown: e.target.value })} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input id="ann-now" type="checkbox" checked={f.publishNow} onChange={(e) => setF({ ...f, publishNow: e.target.checked })} />
            Opublikuj od razu (inaczej szkic)
          </label>
          <button type="submit" disabled={a.pending} className={BTN_MAIN}>Dodaj ogłoszenie</button>
        </div>
        <Blad text={a.error} />
      </form>
      <div className="space-y-2">
        {rows.slice(0, 10).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {kindLabel(r.kind)} · {ANN_STATUS[r.status] ?? r.status}
                {r.publishedAt ? ` · od ${fmt(r.publishedAt)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {r.status !== "PUBLISHED" && r.status !== "ARCHIVED" && (
                <button type="button" disabled={a.pending} className={BTN} onClick={() => a.run(() => setAnnouncementStatusAction(r.id, "PUBLISHED"))}>Opublikuj</button>
              )}
              {r.status !== "ARCHIVED" && (
                <button type="button" disabled={a.pending} className={BTN} onClick={() => a.run(() => setAnnouncementStatusAction(r.id, "ARCHIVED"))}>Zdejmij</button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Brak ogłoszeń.</p>}
      </div>
    </div>
  );
}

/** N-11 — okna serwisowe: widoczne dla klientów danego węzła (albo wszystkich) od 14 dni przed startem. */
export function Maintenance({ rows, servers }: { rows: MaintenanceWindowRow[]; servers: Array<{ id: string; name: string }> }) {
  const a = useAkcja();
  const [f, setF] = useState({ title: "", publicMessage: "", scheduledStart: "", scheduledEnd: "", serverId: "" });
  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Czas z datetime-local liczymy w strefie przeglądarki operatora, nie serwera.
          const iso = { ...f, scheduledStart: new Date(f.scheduledStart).toISOString(), scheduledEnd: new Date(f.scheduledEnd).toISOString() };
          a.run(() => createMaintenanceAction(iso), () => setF({ title: "", publicMessage: "", scheduledStart: "", scheduledEnd: "", serverId: "" }));
        }}
      >
        <input id="mw-title" aria-label="Tytuł" required maxLength={160} placeholder="Tytuł, np. Aktualizacja PHP" className={INPUT} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea id="mw-msg" aria-label="Komunikat dla klientów" maxLength={5000} rows={2} placeholder="Komunikat dla klientów (co się stanie, czy będzie przerwa)" className={INPUT} value={f.publicMessage} onChange={(e) => setF({ ...f, publicMessage: e.target.value })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-neutral-400">Początek
            <input id="mw-start" type="datetime-local" required className={INPUT} value={f.scheduledStart} onChange={(e) => setF({ ...f, scheduledStart: e.target.value })} />
          </label>
          <label className="text-xs text-neutral-400">Koniec
            <input id="mw-end" type="datetime-local" required className={INPUT} value={f.scheduledEnd} onChange={(e) => setF({ ...f, scheduledEnd: e.target.value })} />
          </label>
        </div>
        <select id="mw-server" aria-label="Zakres" className={INPUT} value={f.serverId} onChange={(e) => setF({ ...f, serverId: e.target.value })}>
          <option value="">Cała platforma (wszyscy klienci)</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>Węzeł: {s.name}</option>
          ))}
        </select>
        <div className="flex justify-end">
          <button type="submit" disabled={a.pending} className={BTN_MAIN}>Zaplanuj prace</button>
        </div>
        <Blad text={a.error} />
      </form>
      <div className="space-y-2">
        {rows.slice(0, 10).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {MW_STATUS[r.status] ?? r.status} · {fmt(r.scheduledStart)} – {fmt(r.scheduledEnd)} · {r.server?.name ?? "cała platforma"}
              </p>
            </div>
            <div className="flex gap-2">
              {r.status === "SCHEDULED" && (
                <>
                  <button type="button" disabled={a.pending} className={BTN} onClick={() => a.run(() => setMaintenanceStatusAction(r.id, "IN_PROGRESS"))}>Rozpocznij</button>
                  <button type="button" disabled={a.pending} className={BTN} onClick={() => a.run(() => setMaintenanceStatusAction(r.id, "CANCELED"))}>Odwołaj</button>
                </>
              )}
              {r.status === "IN_PROGRESS" && (
                <button type="button" disabled={a.pending} className={BTN} onClick={() => a.run(() => setMaintenanceStatusAction(r.id, "COMPLETED"))}>Zakończ</button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Brak zaplanowanych prac.</p>}
      </div>
    </div>
  );
}

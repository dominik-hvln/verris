"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  createCanned,
  deleteCanned,
  updateCanned,
  type CannedInput,
  type CannedResponseRow,
} from "./actions";

const TOPICS = ["", "HOSTING", "DOMAIN", "EMAIL", "DNS", "SSL", "BILLING", "OTHER"];

export function CannedClient({ rows }: { rows: CannedResponseRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (input: CannedInput, id?: string) =>
    startTransition(async () => {
      setError(null);
      const res = id ? await updateCanned(id, input) : await createCanned(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreating(false);
      setEditId(null);
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteCanned(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">{rows.length} szablon(ów)</p>
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-emerald-600"
          >
            <Plus className="h-4 w-4" /> Nowy szablon
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
      ) : null}

      {creating ? <Form pending={pending} onCancel={() => setCreating(false)} onSubmit={(i) => submit(i)} /> : null}

      <div className="space-y-2">
        {rows.map((r) =>
          editId === r.id ? (
            <Form key={r.id} initial={r} pending={pending} onCancel={() => setEditId(null)} onSubmit={(i) => submit(i, r.id)} />
          ) : (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {r.topic ? <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{r.topic}</span> : null}
                    {r.title}
                    {!r.isActive ? <span className="ml-2 text-[10px] text-amber-300">nieaktywny</span> : null}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{r.content}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => setEditId(r.id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5">
                    Edytuj
                  </button>
                  <button onClick={() => remove(r.id)} disabled={pending} className="rounded-lg border border-white/10 p-1.5 hover:bg-rose-500/10 hover:border-rose-500/40 disabled:opacity-50" title="Usuń">
                    <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
        {rows.length === 0 && !creating ? <p className="text-sm text-neutral-400">Brak szablonów — dodaj pierwszy.</p> : null}
      </div>
    </div>
  );
}

function Form({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial?: CannedResponseRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: CannedInput) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.04] p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tytuł" className="ip sm:col-span-2" />
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="ip">
          {TOPICS.map((t) => (
            <option key={t} value={t}>{t || "— globalny —"}</option>
          ))}
        </select>
      </div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Treść odpowiedzi…" className="ip w-full" />
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktywny
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSubmit({ title, content, topic: topic || undefined, isActive })}
          disabled={pending || !title.trim() || content.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Zapisz
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5">
          <X className="h-4 w-4" /> Anuluj
        </button>
      </div>
      <style>{`.ip{border-radius:.5rem;background:rgb(0 0 0/.4);border:1px solid rgb(255 255 255/.1);padding:.45rem .65rem;font-size:.85rem;color:#fff;outline:none}.ip:focus{border-color:rgb(16 185 129/.6)}`}</style>
    </div>
  );
}

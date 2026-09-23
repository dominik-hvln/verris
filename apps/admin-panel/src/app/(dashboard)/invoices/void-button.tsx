"use client";

import { useState, useTransition } from "react";
import { anulujDokument } from "./actions";

/** M-08 — „Anuluj” przy nieopłaconym dokumencie; wymaga powodu (trafia do audytu). */
export function VoidButton({ invoiceId, number }: { invoiceId: string; number: string }) {
  const [open, setOpen] = useState(false);
  const [powod, setPowod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-200 hover:bg-red-500/20"
      >
        Anuluj
      </button>
    );
  }
  return (
    <form
      className="flex flex-col items-end gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await anulujDokument(invoiceId, powod.trim());
          if (!r.ok) setError(r.error);
          else setOpen(false);
        });
      }}
    >
      <label className="sr-only" htmlFor={`powod-${invoiceId}`}>Powód anulowania {number}</label>
      <input
        id={`powod-${invoiceId}`}
        value={powod}
        onChange={(e) => setPowod(e.target.value)}
        placeholder={`Powód anulowania ${number}`}
        minLength={5}
        maxLength={500}
        required
        className="w-56 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
      />
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-[10px] font-bold uppercase text-neutral-400 hover:text-white">
          Wróć
        </button>
        <button
          type="submit"
          disabled={pending || powod.trim().length < 5}
          className="rounded-md border border-red-500/40 bg-red-500/20 px-2 py-1 text-[10px] font-bold uppercase text-red-100 disabled:opacity-50"
        >
          {pending ? "Anuluję…" : "Anuluj dokument"}
        </button>
      </div>
      {error ? <p className="max-w-56 text-right text-[11px] text-red-300">{error}</p> : null}
    </form>
  );
}

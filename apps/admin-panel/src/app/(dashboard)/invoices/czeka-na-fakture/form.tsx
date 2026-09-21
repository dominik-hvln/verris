"use client";

import { useState, useTransition } from "react";
import { dopiszFaktureZewnetrzna } from "./actions";

export function DopiszNumerForm({ invoiceId, dokument }: { invoiceId: string; dokument: string }) {
  const [numer, setNumer] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setBlad(null);
        const n = numer.trim();
        if (!n) return;
        start(async () => {
          const r = await dopiszFaktureZewnetrzna(invoiceId, n);
          if (!r.ok) setBlad(r.error);
          else setNumer("");
        });
      }}
    >
      <input
        aria-label={`Numer faktury VAT dla ${dokument}`}
        value={numer}
        onChange={(e) => setNumer(e.target.value)}
        maxLength={64}
        placeholder="np. FV 12/09/2026"
        className="w-44 rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white"
      />
      <button
        type="submit"
        disabled={pending || !numer.trim()}
        className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Zapisuję…" : "Zapisz"}
      </button>
      {blad ? <span className="text-xs text-rose-300">{blad}</span> : null}
    </form>
  );
}

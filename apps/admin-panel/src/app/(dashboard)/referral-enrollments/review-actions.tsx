"use client";

import { useState, useTransition } from "react";
import { reviewReferralEnrollment } from "./actions";

export function ReferralReviewActions({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"APPROVED" | "REJECTED" | null>(null);

  const run = (status: "APPROVED" | "REJECTED") => {
    setError(null);
    startTransition(async () => {
      const res = await reviewReferralEnrollment(userId, status, note);
      if (res.ok) {
        setDone(status);
      } else {
        setError(res.error);
      }
    });
  };

  if (done) {
    return (
      <p className="text-xs text-emerald-300">
        {done === "APPROVED" ? "Zaakceptowano — klient może korzystać z kodu polecającego." : "Odrzucono."}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 min-w-[220px]">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notatka (opcjonalnie)"
        rows={2}
        disabled={pending}
        className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white placeholder:text-neutral-500 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("REJECTED")}
          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
        >
          Odrzuć
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("APPROVED")}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {pending ? "…" : "Akceptuj"}
        </button>
      </div>
      {error ? <p className="text-[10px] text-rose-400 max-w-[220px] text-right">{error}</p> : null}
    </div>
  );
}

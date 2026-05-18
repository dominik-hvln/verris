"use client";

import { useState, useTransition } from "react";
import { retryProvisioningJob } from "./actions";

export function RetryButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Powód retry"
        className="w-48 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white placeholder:text-neutral-500"
      />
      <button
        type="button"
        disabled={pending || done || reason.trim().length < 5}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await retryProvisioningJob(jobId, reason.trim());
            if (res.ok) {
              setDone(true);
            } else {
              setError(res.error);
            }
          });
        }}
        className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
      >
        {done ? "Ponowiono" : pending ? "..." : "Retry"}
      </button>
      {error && <span className="text-[10px] text-red-400 max-w-[200px] truncate">{error}</span>}
    </div>
  );
}

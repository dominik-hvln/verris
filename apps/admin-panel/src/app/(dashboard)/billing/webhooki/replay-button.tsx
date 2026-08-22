"use client";

import { useState, useTransition } from "react";
import { replayWebhookEvent } from "./actions";

export function ReplayButton({
  eventId,
  disabled,
  powod,
}: {
  eventId: string;
  disabled: boolean;
  powod: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (disabled) {
    return (
      <span className="text-[10px] text-neutral-500" title={powod ?? undefined}>
        {powod ?? "—"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || done}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await replayWebhookEvent(eventId);
            if (res.ok) setDone(true);
            else setError(res.error);
          });
        }}
        className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
      >
        {done ? "Przetworzone" : pending ? "..." : "Ponów"}
      </button>
      {error && (
        <span className="max-w-[220px] text-[10px] text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

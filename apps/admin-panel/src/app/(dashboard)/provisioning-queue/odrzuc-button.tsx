"use client";

import { useState, useTransition } from "react";
import { odrzucProvisioningJob } from "./actions";

/**
 * X-32 — odrzucenie martwego joba.
 *
 * Dwa kliknięcia zamiast jednego. Retry można cofnąć następnym retry;
 * odrzucenia nie da się cofnąć wcale, bo wpis znika z Redisa. Potwierdzenie
 * jest tu po to, żeby ta różnica była wyczuwalna w palcach.
 *
 * Zdanie o subskrypcji stoi przy przycisku, nie w dokumentacji — operator ma
 * prawo założyć, że „odrzuć" anuluje zamówienie, a nie anuluje.
 */
export function OdrzucButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [potwierdza, setPotwierdza] = useState(false);

  const gotowy = reason.trim().length >= 5;

  if (done) {
    return <span className="text-[10px] text-neutral-400">Odrzucono</span>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setPotwierdza(false);
        }}
        placeholder="Powód odrzucenia"
        className="w-48 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white placeholder:text-neutral-500"
      />
      {potwierdza ? (
        <div className="flex flex-col items-end gap-1">
          <span className="max-w-[200px] text-right text-[10px] leading-tight text-amber-300">
            Usuwa wpis z kolejki bez możliwości cofnięcia. Subskrypcja zostaje
            nietknięta.
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPotwierdza(false)}
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-300 hover:bg-white/5"
            >
              Anuluj
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await odrzucProvisioningJob(jobId, reason.trim());
                  if (res.ok) {
                    setDone(true);
                  } else {
                    setError(res.error);
                    setPotwierdza(false);
                  }
                });
              }}
              className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/20 disabled:opacity-50"
            >
              {pending ? "..." : "Potwierdź"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!gotowy}
          onClick={() => setPotwierdza(true)}
          className="rounded-md border border-white/10 px-3 py-1 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50"
        >
          Odrzuć
        </button>
      )}
      {error && (
        <span className="max-w-[220px] text-right text-[10px] leading-tight text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}

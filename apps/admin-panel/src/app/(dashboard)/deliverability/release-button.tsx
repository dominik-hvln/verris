"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseCordon } from "./actions";
import { potwierdz } from "@/components/potwierdz";

export function ReleaseCordonButton({ userId, label }: { userId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        onClick={async () => {
          if (!(await potwierdz(`Zdjąć blokadę wysyłki dla ${label}? Upewnij się, że przyczyna (np. przejęta skrzynka) jest usunięta.`, { akcja: 'Zdejmij', niebezpieczne: true }))) return;
          setError(null);
          start(async () => {
            const res = await releaseCordon(userId);
            if ("error" in res) setError(res.error);
            else router.refresh();
          });
        }}
        className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
      >
        {pending ? "Chwila…" : "Zdejmij blokadę"}
      </button>
      {error ? <span className="text-[11px] text-rose-300">{error}</span> : null}
    </div>
  );
}

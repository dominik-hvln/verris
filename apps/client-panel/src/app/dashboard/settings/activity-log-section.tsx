"use client";

import { useEffect, useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { fetchAccountActivity, type AccountActivityEntry } from "./activity-actions";
import { ETYKIETY_DZIENNIKA } from "@/lib/etykiety-dziennika";


function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ActivityLogSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AccountActivityEntry[]>([]);

  useEffect(() => {
    void fetchAccountActivity().then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4 border-t border-white/5 pt-8">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <ScrollText className="h-5 w-5" /> Aktywność konta
        </h3>
        <p className="mt-1 text-sm text-neutral-400">
          Ostatnie zmiany na Twoim koncie — także te zrobione przez subkonta i obsługę. Pełna
          przejrzystość — wiesz dokładnie, co i kiedy się działo.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie aktywności…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-[#0a0a0a]/50 px-4 py-8 text-center text-sm text-neutral-500">
          Brak zarejestrowanych zmian. Tu pojawią się Twoje działania na koncie.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a]/50">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="break-words text-sm text-white">{ETYKIETY_DZIENNIKA[r.action] ?? r.action}</p>
                {r.context || r.actor ? (
                  <p className="break-words text-[11px] text-neutral-500">
                    {[r.context, r.actor ? `wykonał(a): ${r.actor}` : null].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-neutral-400">{fmt(r.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

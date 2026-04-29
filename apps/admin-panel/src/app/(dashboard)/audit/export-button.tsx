"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { downloadAuditCsvAction } from "./actions";
import type { AuditFilters } from "./types";

export function ExportCsvButton({ filters }: { filters: AuditFilters }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await downloadAuditCsvAction(filters);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Eksport CSV
      </button>
      {error && <span className="text-[11px] text-rose-300">{error}</span>}
    </div>
  );
}

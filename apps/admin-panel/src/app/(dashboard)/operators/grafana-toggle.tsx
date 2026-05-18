"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { setGrafanaAccessAction } from "./actions";

export function GrafanaAccessToggle({
  userId,
  initialValue,
  role,
}: {
  userId: string;
  initialValue: boolean;
  role: "STAFF" | "ADMIN";
}) {
  const [enabled, setEnabled] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
        <ShieldCheck className="h-3 w-3" />
        zawsze (ADMIN)
      </span>
    );
  }

  const handleToggle = () => {
    setError(null);
    const reason = enabled ? "Wyłączenie z UI" : "Włączenie z UI";
    startTransition(async () => {
      const res = await setGrafanaAccessAction({
        userId,
        enabled: !enabled,
        reason,
      });
      if (res.ok) {
        setEnabled(res.data?.canAccessGrafana ?? !enabled);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
          enabled
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
            : "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
        } disabled:opacity-50`}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : enabled ? (
          <ShieldCheck className="h-3 w-3" />
        ) : (
          <ShieldX className="h-3 w-3" />
        )}
        {enabled ? "Włączony" : "Wyłączony"}
      </button>
      {error ? (
        <p className="text-[10px] text-rose-300 max-w-[260px]">{error}</p>
      ) : null}
    </div>
  );
}

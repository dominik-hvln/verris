"use client";

import { useEffect, useState, useTransition } from "react";
import { ShieldAlert, X, Clock } from "lucide-react";
import {
  getImpersonationContext,
  stopImpersonationAction,
  type ImpersonationContext,
} from "./impersonation-actions";

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "0:00";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ImpersonationBanner() {
  const [ctx, setCtx] = useState<ImpersonationContext | null>(null);
  const [now, setNow] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getImpersonationContext().then((c) => {
      if (!cancelled) setCtx(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ctx?.isImpersonating) return;
    const interval = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => window.clearInterval(interval);
  }, [ctx?.isImpersonating]);

  if (!ctx?.isImpersonating) return null;

  const remaining = formatRemaining(ctx.expiresAt);
  const expired = remaining === "0:00";
  const returnTarget =
    ctx.origin === "staff" ? "panelu staff" : "panelu admin";
  // referenced to silence unused-var warning; the timer drives re-render.
  void now;

  return (
    <div
      className={`sticky top-0 z-[60] border-b shadow-lg ${
        expired
          ? "bg-rose-500 text-white border-rose-400"
          : "bg-amber-400 text-black border-amber-300"
      }`}
    >
      <div className="max-w-screen-2xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-semibold">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="truncate">
              Sesja impersonowana przez wsparcie Verris
              {ctx.actorUserId ? ` · operator ${ctx.actorUserId.slice(0, 8)}…` : ""}
              {ctx.reason ? ` · powód: „${ctx.reason}"` : ""}
            </div>
            <div className="text-[11px] font-normal opacity-80">
              Wszystkie akcje są rejestrowane w logach. Powrót po zakończeniu wraca do{" "}
              {returnTarget}.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/10 px-2 py-1 text-xs font-mono tabular-nums">
            <Clock className="h-3.5 w-3.5" />
            {remaining}
          </span>
          <button
            onClick={() =>
              startTransition(async () => {
                await stopImpersonationAction();
              })
            }
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-black/10 hover:bg-black/20 px-3 py-1 text-xs font-bold disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Powrót do {returnTarget}
          </button>
        </div>
      </div>
    </div>
  );
}

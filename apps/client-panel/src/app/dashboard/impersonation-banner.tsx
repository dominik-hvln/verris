"use client";

import { useEffect, useState, useTransition } from "react";
import { ShieldAlert, X } from "lucide-react";
import {
  getImpersonationContext,
  stopImpersonationAction,
  type ImpersonationContext,
} from "./impersonation-actions";

export function ImpersonationBanner() {
  const [ctx, setCtx] = useState<ImpersonationContext | null>(null);
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

  if (!ctx?.isImpersonating) return null;

  const expiresIn = ctx.expiresAt
    ? Math.max(
        0,
        Math.floor((new Date(ctx.expiresAt).getTime() - Date.now()) / 60000),
      )
    : null;

  return (
    <div className="sticky top-0 z-[60] bg-amber-400 text-black border-b border-amber-300 shadow-lg">
      <div className="max-w-screen-2xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-semibold">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Sesja impersonowana przez wsparcie EkoHost
            {ctx.actorUserId ? ` (operator ${ctx.actorUserId.slice(0, 8)}…)` : ""}.
            Wszystkie akcje są rejestrowane w logach.
            {expiresIn !== null && ` Wygasa za ~${expiresIn} min.`}
          </span>
        </div>
        <button
          onClick={() =>
            startTransition(async () => {
              await stopImpersonationAction();
            })
          }
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-black/10 hover:bg-black/20 px-3 py-1 text-xs font-bold disabled:opacity-50 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
          Zakończ sesję
        </button>
      </div>
    </div>
  );
}

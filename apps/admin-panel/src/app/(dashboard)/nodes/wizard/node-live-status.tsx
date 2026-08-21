"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react";
import { fetchServer } from "../actions";

export interface NodeLiveSignals {
  handshake: boolean;
  heartbeatFresh: boolean;
  active: boolean;
  daConfigured: boolean;
}

interface Signal {
  key: keyof NodeLiveSignals;
  label: string;
  detail: string;
}

const SIGNALS: Signal[] = [
  { key: "handshake", label: "Agent połączony (bootstrap)", detail: "Węzeł wykonał handshake z control-plane." },
  { key: "heartbeatFresh", label: "Agent raportuje na żywo", detail: "Telemetria z ostatnich 5 minut." },
  { key: "active", label: "Węzeł aktywny", detail: "Status ACTIVE — zaakceptowany do ruchu." },
  { key: "daConfigured", label: "DirectAdmin skonfigurowany", detail: "Zapisany login key DA (test API gotowy)." },
];

const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;

/**
 * ADM-1+ — żywa weryfikacja kroków wizarda. Zamiast ręcznego „odhaczania",
 * panel co kilka sekund odpytuje realny stan węzła (handshake, heartbeat,
 * status, DA) i sam potwierdza, co już działa. Operator widzi prawdę, nie deklarację.
 */
export function NodeLiveStatus({
  serverId,
  onSignals,
}: {
  serverId: string;
  onSignals?: (s: NodeLiveSignals) => void;
}) {
  const [signals, setSignals] = useState<NodeLiveSignals | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const onSignalsRef = useRef(onSignals);
  onSignalsRef.current = onSignals;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      setLoading(true);
      const { data } = await fetchServer(serverId);
      setLoading(false);
      if (cancelled || !data) return;
      const now = Date.now();
      const hb = data.lastHeartbeatAt ? new Date(data.lastHeartbeatAt).getTime() : 0;
      const next: NodeLiveSignals = {
        handshake: Boolean(data.lastHandshakeAt) || hb > 0,
        heartbeatFresh: hb > 0 && now - hb < HEARTBEAT_FRESH_MS,
        active: data.status === "ACTIVE",
        daConfigured: Boolean(data.daPasswordSet),
      };
      setSignals(next);
      setCheckedAt(new Date());
      onSignalsRef.current?.(next);
    };
    void poll();
    const id = setInterval(() => void poll(), 7000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverId]);

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
          ) : (
            <RefreshCw className="h-4 w-4 text-emerald-300" />
          )}
          Weryfikacja na żywo
        </p>
        {checkedAt ? (
          <span className="text-[10px] text-muted-foreground">
            sprawdzono {checkedAt.toLocaleTimeString("pl-PL")}
          </span>
        ) : null}
      </div>
      <ul className="space-y-2">
        {SIGNALS.map((s) => {
          const ok = signals?.[s.key] ?? false;
          return (
            <li key={s.key} className="flex items-start gap-2.5">
              {ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
              )}
              <div>
                <p className={`text-sm ${ok ? "text-white" : "text-muted-foreground"}`}>{s.label}</p>
                <p className="text-[11px] text-muted-foreground">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Panel sam odświeża stan — gdy krok faktycznie zadziała na węźle, zaświeci się tutaj na zielono.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { fetchMyIncidents, type UserIncident } from "./incident-banner-actions";

const POLL_INTERVAL_MS = 60_000;
const DISMISS_STORAGE_KEY = "ekohost.dismissed-incidents";

const STATUS_PAGE_URL =
  process.env.NEXT_PUBLIC_STATUS_PAGE_URL ?? "https://status.ekohost.pl";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Quota or sandbox; ignore.
  }
}

export function IncidentBanner() {
  const [incidents, setIncidents] = useState<UserIncident[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    const fresh = await fetchMyIncidents();
    setIncidents(fresh);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const visible = (incidents ?? []).filter((i) => !dismissed.has(incidentKey(i)));
  if (visible.length === 0) return null;

  const dismiss = (incident: UserIncident) => {
    const next = new Set(dismissed);
    next.add(incidentKey(incident));
    setDismissed(next);
    saveDismissed(next);
  };

  const hasMajor = visible.some((i) => i.severity === "MAJOR");
  const tone = hasMajor
    ? "bg-rose-500 text-white border-rose-400"
    : "bg-amber-400 text-black border-amber-300";

  return (
    <div className={`sticky top-0 z-[55] border-b ${tone} shadow-lg`}>
      <div className="max-w-screen-2xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between gap-4 text-sm font-semibold">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {hasMajor
                ? "Wykryliśmy poważne zakłócenie usługi na Twoich serwerach"
                : "Wykryliśmy pogorszenie jakości usługi na Twoich serwerach"}
              {visible.length > 1 ? ` (${visible.length} aktywnych)` : ""}.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={STATUS_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-black/10 hover:bg-black/20 px-2.5 py-1 text-xs font-bold"
            >
              <ExternalLink className="h-3 w-3" />
              Status page
            </a>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-black/10 hover:bg-black/20 px-2.5 py-1 text-xs font-bold"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Zwiń
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Szczegóły
                </>
              )}
            </button>
          </div>
        </div>

        {expanded && (
          <ul className="mt-2 space-y-1.5">
            {visible.map((incident) => (
              <li
                key={incidentKey(incident)}
                className="flex items-center justify-between gap-3 rounded-lg bg-black/5 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-bold uppercase tracking-wider opacity-80">
                    {incident.severity === "MAJOR" ? "Poważny" : "Drobny"}
                  </span>
                  <span className="mx-2 opacity-60">•</span>
                  <span className="font-semibold">{incident.serverName}</span>
                  <span className="mx-2 opacity-60">•</span>
                  <span className="font-mono opacity-80">
                    {incident.probeKind} → {incident.probeTarget}
                  </span>
                  <div className="mt-0.5 opacity-90 truncate">{incident.title}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="opacity-70">
                    od {new Date(incident.startedAt).toLocaleTimeString("pl-PL")}
                  </span>
                  <button
                    onClick={() => dismiss(incident)}
                    className="rounded-md bg-black/10 hover:bg-black/20 p-1"
                    aria-label="Zamknij komunikat"
                    title="Zamknij komunikat"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function incidentKey(incident: UserIncident): string {
  return `${incident.serverId}:${incident.probeKind}:${incident.probeTarget}:${incident.startedAt}`;
}

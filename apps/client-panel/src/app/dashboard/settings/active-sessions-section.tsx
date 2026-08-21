"use client";

import { useEffect, useState, useTransition } from "react";
import { MonitorSmartphone, Loader2, LogOut, MapPin } from "lucide-react";
import { fetchSessions, revokeSession, type SessionEntry } from "./sessions-actions";

const METHOD: Record<string, string> = {
  password: "Hasło",
  "password+2fa": "Hasło + 2FA",
  passkey: "Passkey",
  "break-glass": "Awaryjne",
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ActiveSessionsSection({
  showToast,
}: {
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionEntry[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = () => {
    void fetchSessions().then((data) => {
      setRows(data);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const onRevoke = (s: SessionEntry) => {
    setPendingId(s.id);
    startTransition(async () => {
      const res = await revokeSession(s.id);
      setPendingId(null);
      if ("error" in res) {
        showToast(res.error!, "error");
      } else {
        showToast(s.current ? "Wylogowano bieżącą sesję." : "Urządzenie wylogowane.", "success");
        if (s.current) {
          window.location.href = "/login?reason=session-ended";
          return;
        }
        setRows((prev) => prev.filter((r) => r.id !== s.id));
      }
    });
  };

  return (
    <div className="space-y-4 border-t border-white/5 pt-8">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <MonitorSmartphone className="h-5 w-5" /> Aktywne urządzenia
        </h3>
        <p className="mt-1 text-sm text-neutral-400">
          Urządzenia, na których jesteś zalogowany. Nie poznajesz któregoś? Wyloguj je jednym
          kliknięciem — pełna kontrola nad dostępem do konta.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie sesji…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-[#0a0a0a]/50 px-4 py-8 text-center text-sm text-neutral-500">
          Brak zarejestrowanych aktywnych sesji.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a]/50">
          {rows.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm text-white">
                  <span className="truncate">{s.deviceLabel ?? "Nieznane urządzenie"}</span>
                  {s.current ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      to urządzenie
                    </span>
                  ) : null}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <MapPin className="h-3 w-3" />
                  {s.ipAddress ?? "—"}
                  <span className="text-neutral-600">·</span>
                  {METHOD[s.loginMethod ?? ""] ?? s.loginMethod ?? "—"}
                  <span className="text-neutral-600">·</span>
                  aktywna {fmt(s.lastSeenAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRevoke(s)}
                disabled={pendingId === s.id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {pendingId === s.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                {s.current ? "Wyloguj" : "Wyloguj"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

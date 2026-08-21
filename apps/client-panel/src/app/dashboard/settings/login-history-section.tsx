"use client";

import { useEffect, useState } from "react";
import { History, Loader2, MapPin, Monitor, ShieldAlert } from "lucide-react";
import { fetchLoginHistory, type LoginHistoryEntry } from "./login-history-actions";

const METHOD_LABEL: Record<string, string> = {
  password: "Hasło",
  "password+2fa": "Hasło + 2FA",
  passkey: "Passkey",
  "oauth-google": "Google",
};

function formatAt(iso: string): string {
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

export function LoginHistorySection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LoginHistoryEntry[]>([]);

  useEffect(() => {
    void fetchLoginHistory().then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4 border-t border-white/5 pt-8">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <History className="h-5 w-5" /> Aktywność logowania
        </h3>
        <p className="mt-1 text-sm text-neutral-400">
          Ostatnie logowania do Twojego konta. Jeśli widzisz nieznane urządzenie lub lokalizację —
          natychmiast zmień hasło i wyloguj wszystkie sesje.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie historii…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-[#0a0a0a]/50 px-4 py-8 text-center text-sm text-neutral-500">
          Brak zapisanych logowań.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a]/50">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 last:border-0"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 text-sm text-white">
                  <Monitor className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  <span className="truncate">{r.device ?? "Nieznane urządzenie"}</span>
                  {r.isNewDevice ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                      <ShieldAlert className="h-3 w-3" /> nowe urządzenie
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {r.ipAddress ?? "—"}
                  {r.countryCode ? ` · ${r.countryCode}` : ""}
                  <span className="text-neutral-600">·</span>
                  {METHOD_LABEL[r.loginMethod] ?? r.loginMethod}
                </div>
              </div>
              <span className="shrink-0 text-xs text-neutral-400">{formatAt(r.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

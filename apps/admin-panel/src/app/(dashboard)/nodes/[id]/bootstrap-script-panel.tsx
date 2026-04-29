"use client";

import { useState, useTransition } from "react";
import { Terminal, RefreshCw, Copy, Check, Loader2 } from "lucide-react";
import type { BootstrapScriptResponseDto } from "@ekohost/contracts";
import { generateBootstrapScript } from "../actions";

export function BootstrapScriptPanel({ serverId }: { serverId: string }) {
  const [data, setData] = useState<BootstrapScriptResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateBootstrapScript(serverId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setData(result.data ?? null);
    });
  };

  const onCopy = () => {
    if (!data) return;
    void navigator.clipboard.writeText(data.script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Terminal className="h-4 w-4 text-indigo-300" /> Skrypt bootstrap
        </div>
        <button
          onClick={onGenerate}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {data ? "Wygeneruj nowy" : "Wygeneruj skrypt"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Token bootstrap jest jednorazowy i traci ważność po 48 godzinach. Każde kliknięcie
        generuje nowy token — poprzedni wciąż działa do czasu wygaśnięcia, jeśli nie został użyty.
      </p>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      {data && (
        <>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Wygasa: <strong className="text-white">{new Date(data.expiresAt).toLocaleString("pl-PL")}</strong>
            </span>
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-1 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" /> Skopiowane
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Kopiuj
                </>
              )}
            </button>
          </div>
          <pre className="text-[12px] leading-relaxed bg-black/60 rounded-lg p-3 overflow-x-auto max-h-[300px] border border-white/5">
            <code>{data.script}</code>
          </pre>
        </>
      )}
    </div>
  );
}

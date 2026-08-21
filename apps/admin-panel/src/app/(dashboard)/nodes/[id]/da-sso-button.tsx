"use client";

import { useState } from "react";
import { ExternalLink, Loader2, TerminalSquare } from "lucide-react";
import { createNodeSsoUrl } from "./da-sso-actions";

/**
 * FALA-2c — szybkie wejście na węzeł jako admin:
 *  - „DirectAdmin (SSO)" otwiera panel DA węzła przez jednorazowy link (2 min, 1 użycie),
 *  - obok kopiowalna komenda SSH.
 */
export function DaSsoButton({ serverId, sshHost }: { serverId: string; sshHost: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Okno otwieramy PRZED awaitem (polityka popupów), potem podmieniamy adres.
    const win = window.open("about:blank", "_blank", "noopener");
    const res = await createNodeSsoUrl(serverId);
    setBusy(false);
    if ("error" in res) {
      if (win) win.close();
      setError(res.error);
      return;
    }
    if (win) win.location.href = res.data.url;
    else window.open(res.data.url, "_blank");
  };

  const copySsh = async () => {
    if (!sshHost) return;
    try {
      await navigator.clipboard.writeText(`ssh root@${sshHost}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard może być zablokowany — nic nie robimy */
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          title="Jednorazowy link logowania (ważny 2 minuty)"
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          DirectAdmin (SSO)
        </button>
        {sshHost ? (
          <button
            type="button"
            onClick={() => void copySsh()}
            title={`Kopiuj: ssh root@${sshHost}`}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 hover:bg-white/10"
          >
            <TerminalSquare className="h-4 w-4" />
            {copied ? "Skopiowano" : "SSH"}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

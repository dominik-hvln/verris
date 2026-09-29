"use client";

import { useState, type ReactNode } from "react";
import { PRZYCISK, PRZYCISK_GLOWNY } from "@/components/v2";
import { ExternalLink, Loader2, TerminalSquare } from "lucide-react";
import { createNodeSsoUrl } from "./da-sso-actions";

/**
 * FALA-2c — szybkie wejście na węzeł jako admin:
 *  - „DirectAdmin (SSO)" otwiera panel DA węzła przez jednorazowy link (2 min, 1 użycie),
 *  - obok kopiowalna komenda SSH,
 *  - pod spodem informacja o tunelu SSH (port 2222 tylko z control-plane'u, decyzja 2026-09-29).
 */
export function DaSsoButton({ serverId, sshHost, srodek, daGotowe = true }: { serverId: string; sshHost: string | null; srodek?: ReactNode; daGotowe?: boolean }) {
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
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {sshHost ? (
          <button type="button" onClick={() => void copySsh()} title={`Kopiuj: ssh root@${sshHost}`} className={PRZYCISK}>
            <TerminalSquare className="h-4 w-4" />
            {copied ? "Skopiowano" : "SSH"}
          </button>
        ) : null}
        {srodek}
        {daGotowe ? (
          <button
            type="button"
            onClick={() => void open()}
            disabled={busy}
            title="Jednorazowy link logowania (ważny 2 minuty)"
            className={PRZYCISK_GLOWNY}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Otwórz DirectAdmin
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-crit">{error}</p> : null}
      {daGotowe ? (
        // Decyzja 2026-09-29: port 2222 węzła przyjmuje tylko control-plane (zapora w profilu węzła).
        <p className="max-w-md text-right text-xs text-muted-foreground">
          Panel DA (:2222) jest dostępny tylko z control-plane&apos;u. Z przeglądarki przez tunel SSH:{" "}
          <code>ssh -L 2222:127.0.0.1:2222 root@{sshHost ?? "<węzeł>"}</code>, potem w otwartym linku zamień adres węzła na
          127.0.0.1.
        </p>
      ) : null}
    </div>
  );
}

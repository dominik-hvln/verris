"use client";

import { useState, type ReactNode } from "react";
import { komendySshWezla } from "@verris/contracts";
import { PRZYCISK, PRZYCISK_GLOWNY } from "@/components/v2";
import { ExternalLink, Loader2, TerminalSquare } from "lucide-react";
import { createNodeSsoUrl } from "./da-sso-actions";
import { otworzLinkJednorazowy } from "@/lib/otworz-link-jednorazowy";

/**
 * FALA-2c — szybkie wejście na węzeł jako admin:
 *  - „DirectAdmin (SSO)" otwiera panel DA węzła przez jednorazowy link (2 min, 1 użycie),
 *  - obok kopiowalna komenda powłoki na węźle (na control-plane, klucz deploy — weryfikacja 11.10),
 *  - pod spodem tunel do panelu (port 2222 tylko z control-plane'u, decyzja 2026-09-29) — SOCKS przez control-plane
 *    (decyzja 17.10: link SSO zostaje z nazwą węzła, certyfikat panelu jest na nią).
 * `sshHost` — adres węzła (najlepiej IP; verris-node.sh przyjmuje IP, nazwę albo początek ID).
 */
export function DaSsoButton({ serverId, sshHost, srodek, daGotowe = true }: { serverId: string; sshHost: string | null; srodek?: ReactNode; daGotowe?: boolean }) {
  const komendy = sshHost ? komendySshWezla(sshHost) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Obserwacja 13.10: port 2222 węzła przyjmuje tylko control-plane, więc otwarta karta wisiała bez komunikatu,
  // a przycisk wyglądał, jakby nic nie zrobił. Po otwarciu pokazujemy, co dalej, i link gotowy dla tunelu.
  const [otwarty, setOtwarty] = useState<string | null>(null);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setOtwarty(null);
    let url: string | null = null;
    // Okno przed awaitem (polityka popupów), potem podmiana adresu — wspólne z Cmd+K.
    const blad = await otworzLinkJednorazowy(async () => {
      const r = await createNodeSsoUrl(serverId);
      if ("data" in r) url = r.data.url;
      return r;
    });
    setBusy(false);
    if (blad) setError(blad);
    else setOtwarty(url);
  };

  const copySsh = async () => {
    if (!komendy) return;
    try {
      await navigator.clipboard.writeText(komendy.powloka);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard może być zablokowany — nic nie robimy */
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {komendy ? (
          <button type="button" onClick={() => void copySsh()} title={`Kopiuj (uruchom na control-plane): ${komendy.powloka}`} className={PRZYCISK}>
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
      {otwarty ? <PoOtwarciu url={otwarty} komendy={komendy} /> : null}
      {komendy ? (
        // Weryfikacja 11.10 — klucz osobisty na węźle: „Permission denied (publickey)”; węzeł przyjmuje klucz deploy z CP.
        <p className="max-w-md text-right text-xs text-muted-foreground" data-podpowiedz-ssh="">
          SSH na węzeł tylko z control-plane&apos;u (klucz deploy): <code>{komendy.powloka}</code>
          {daGotowe ? (
            // Decyzja 2026-09-29: port 2222 węzła przyjmuje tylko control-plane (zapora w profilu węzła) — tunel przez CP.
            <>
              . Panel DA (:2222) też tylko z control-plane&apos;u — z przeglądarki tunel SOCKS przez control-plane:{" "}
              <code>{komendy.tunelPanelu}</code> i przeglądarka z proxy <code>{komendy.przegladarkaPrzezTunel}</code>
            </>
          ) : null}
          .
        </p>
      ) : null}
    </div>
  );
}

function PoOtwarciu({ url, komendy }: { url: string; komendy: ReturnType<typeof komendySshWezla> | null }) {
  return (
    <p className="max-w-md text-right text-xs text-muted-foreground" role="status" data-sso-otwarte="">
      Otworzyliśmy jednorazowy link (ważny 2 minuty) w nowej karcie. Jeśli karta się nie ładuje, panel węzła przyjmuje
      połączenia tylko z control-plane&apos;u
      {komendy ? (
        <>
          {" "}— uruchom tunel <code>{komendy.tunelPanelu}</code>, otwórz przeglądarkę przez tunel{" "}
          <code>{komendy.przegladarkaPrzezTunel}</code> i wklej w niej{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            ten sam link
          </a>{" "}
          (adres bez zmian — certyfikat jest na nazwę węzła)
        </>
      ) : null}
      .
    </p>
  );
}

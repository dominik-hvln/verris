"use client";

import { useState, useTransition } from "react";
import { LIMITY_INDYWIDUALNE, MIN_POWOD_LIMITOW, formatLimitu, walidujLimityIndywidualne, type PoleLimitu, type PozycjaLimitu } from "@verris/contracts";
import { potwierdz } from "@/components/potwierdz";
import { POLE } from "@/components/kolejka-poczty";
import { zapiszLimityAction } from "./limity-indywidualne-actions";

const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
const jednostka = (pole: PoleLimitu) => LIMITY_INDYWIDUALNE[pole].jednostka;

/**
 * K3 (PB-53.5) — „Limity indywidualne” na karcie usługi (sekcja Operacje): dysk, transfer, domeny, skrzynki, bazy.
 * Puste pole = jak w planie; „Przywróć limity planu” zdejmuje wszystkie nadpisania. Tylko administrator (API odrzuca
 * personel), powód obowiązkowy. Klient widzi nowe limity na karcie usługi jako „Limity ustalone indywidualnie”.
 */
export function LimityIndywidualnePanel({ subscriptionId, limity, isAdmin }: { subscriptionId: string; limity: PozycjaLimitu[]; isAdmin: boolean }) {
  const [wartosci, setWartosci] = useState<Record<string, string>>(() =>
    Object.fromEntries(limity.map((l) => [l.pole, l.nadpisanie === null ? "" : String(l.nadpisanie)])),
  );
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const maNadpisania = limity.some((l) => l.nadpisanie !== null);
  const walidacja = walidujLimityIndywidualne(wartosci);
  const powodOk = powod.trim().length >= MIN_POWOD_LIMITOW;
  const zablokowane = !isAdmin || pending;

  const zapisz = async (przywroc: boolean) => {
    if (!przywroc && !walidacja.ok) return;
    const opis = przywroc
      ? "Przywrócić limity planu tej usługi?"
      : `Ustawić limity: ${Object.entries(walidacja.ok ? walidacja.limity : {})
          .map(([p, v]) => `${LIMITY_INDYWIDUALNE[p as PoleLimitu].etykieta} ${formatLimitu(p as PoleLimitu, v)}`)
          .join(", ") || "jak w planie"}?`;
    if (!(await potwierdz(`${opis} Zmiana trafi od razu na serwer; klient zobaczy wpis „obsługa Verris” na karcie usługi.`, { akcja: przywroc ? "Przywróć" : "Zapisz" }))) return;
    start(async () => {
      setMsg(null);
      const limityDoWyslania = przywroc
        ? null
        : Object.fromEntries(limity.map((l) => [l.pole, walidacja.ok ? (walidacja.limity[l.pole] ?? null) : null]));
      const r = await zapiszLimityAction(subscriptionId, { limity: limityDoWyslania, powod, zgloszenie }).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: r.komunikat });
      setPowod("");
      setZgloszenie("");
      if (przywroc) setWartosci(Object.fromEntries(limity.map((l) => [l.pole, ""])));
    });
  };

  return (
    <div className="space-y-3" data-sekcja="limity-indywidualne">
      {!isAdmin ? <p className="text-xs text-muted-foreground">Limity indywidualne ustawia administrator.</p> : null}
      <div className="grid gap-2 md:grid-cols-2">
        {limity.map((l) => (
          <label key={l.pole} className="block space-y-1" data-limit={l.pole}>
            <span className="text-xs text-neutral-400">
              {l.etykieta}
              {jednostka(l.pole) ? ` (${jednostka(l.pole)})` : ""} — w planie: {formatLimitu(l.pole, l.plan)}
              {l.nadpisanie !== null ? <span className="text-amber-200"> · teraz {formatLimitu(l.pole, l.nadpisanie)}</span> : null}
            </span>
            <input
              value={wartosci[l.pole] ?? ""}
              onChange={(e) => setWartosci((w) => ({ ...w, [l.pole]: e.target.value.replace(/\D/g, "") }))}
              inputMode="numeric"
              maxLength={8}
              placeholder="jak w planie"
              disabled={zablokowane}
              className={`${POLE} font-mono`}
            />
          </label>
        ))}
      </div>
      {!walidacja.ok ? <p className="text-xs text-rose-200">{walidacja.blad}</p> : null}
      <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Powód do dziennika (min. {MIN_POWOD_LIMITOW} znaków)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={zablokowane} placeholder="np. umowa z klientem z 12.10 — więcej miejsca na pocztę" className={POLE} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Zgłoszenie klienta</span>
          <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={zablokowane} placeholder="#ab12cd34" className={`${POLE} font-mono`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          data-akcja="zapisz-limity"
          className={przycisk}
          disabled={zablokowane || !powodOk || !walidacja.ok}
          title={!isAdmin ? "Tylko administrator" : !powodOk ? "Najpierw wpisz powód" : undefined}
          onClick={() => void zapisz(false)}
        >
          Zapisz limity
        </button>
        {maNadpisania ? (
          <button type="button" data-akcja="przywroc-limity" className={przycisk} disabled={zablokowane || !powodOk} title={!powodOk ? "Najpierw wpisz powód" : undefined} onClick={() => void zapisz(true)}>
            Przywróć limity planu
          </button>
        ) : null}
      </div>
      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}

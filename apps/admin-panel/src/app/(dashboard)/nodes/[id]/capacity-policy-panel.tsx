"use client";

import { useState, useTransition } from "react";
import { Loader2, Gauge, Ban, CheckCircle2 } from "lucide-react";
import { setNodeCapacityPolicy } from "../actions";

interface Props {
  serverId: string;
  acceptsNewAccounts: boolean;
  maxAccounts: number | null;
  reservedHeadroomPercent: number;
  overcommitCpu: number;
  overcommitRam: number;
  overcommitDisk: number;
  accountCount: number;
}

export function CapacityPolicyPanel({
  serverId,
  acceptsNewAccounts,
  maxAccounts,
  reservedHeadroomPercent,
  overcommitCpu,
  overcommitRam,
  overcommitDisk,
  accountCount,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [accepts, setAccepts] = useState(acceptsNewAccounts);
  const [maxAcc, setMaxAcc] = useState<string>(maxAccounts != null ? String(maxAccounts) : "");
  const [headroom, setHeadroom] = useState<string>(String(reservedHeadroomPercent ?? 0));
  const [ocCpu, setOcCpu] = useState<string>(String(overcommitCpu ?? 1));
  const [ocRam, setOcRam] = useState<string>(String(overcommitRam ?? 1));
  const [ocDisk, setOcDisk] = useState<string>(String(overcommitDisk ?? 1));

  const save = (override?: { accepts?: boolean }) => {
    setError(null);
    setOk(false);
    const nextAccepts = override?.accepts ?? accepts;
    const maxParsed = maxAcc.trim() === "" ? null : Number.parseInt(maxAcc, 10);
    const headParsed = Number.parseInt(headroom, 10) || 0;
    if (maxParsed != null && (!Number.isInteger(maxParsed) || maxParsed < 0)) {
      setError("Maks. liczba kont musi być nieujemną liczbą lub pusta.");
      return;
    }
    if (headParsed < 0 || headParsed > 90) {
      setError("Rezerwa headroom musi być w zakresie 0–90%.");
      return;
    }

    // Z-12 — nadsubskrypcja. Te same granice co w node-capacity.ts; serwer
    // waliduje je jeszcze raz, bo panel nie jest ostatnią linią obrony.
    const ocCpuParsed = Number.parseFloat(ocCpu.replace(",", "."));
    const ocRamParsed = Number.parseFloat(ocRam.replace(",", "."));
    const ocDiskParsed = Number.parseFloat(ocDisk.replace(",", "."));
    for (const [nazwa, wartosc, maks] of [
      ["CPU", ocCpuParsed, 8],
      ["RAM", ocRamParsed, 8],
      ["dysku", ocDiskParsed, 3],
    ] as const) {
      if (!Number.isFinite(wartosc) || wartosc < 1 || wartosc > maks) {
        setError(`Nadsubskrypcja ${nazwa} musi być z zakresu 1–${maks}.`);
        return;
      }
    }

    startTransition(async () => {
      const res = await setNodeCapacityPolicy(serverId, {
        acceptsNewAccounts: nextAccepts,
        maxAccounts: maxParsed,
        reservedHeadroomPercent: headParsed,
        overcommitCpu: ocCpuParsed,
        overcommitRam: ocRamParsed,
        overcommitDisk: ocDiskParsed,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setAccepts(nextAccepts);
        setOk(true);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Gauge className="h-4 w-4 text-sky-300" />
        Pojemność i przyjmowanie kont (OPS-1)
      </div>

      <p className="text-xs text-muted-foreground">
        Steruje doborem węzła przez scheduler — niezależnie od trybu maintenance.
        „Cordon" wstrzymuje tylko nowe konta na TYM węźle (istniejące działają),
        bez wstrzymywania sprzedaży na całej platformie.
      </p>

      {/* Cordon toggle */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            {accepts ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <Ban className="h-4 w-4 text-amber-300" />
            )}
            {accepts ? "Przyjmuje nowe konta" : "Cordon — nowe konta wstrzymane"}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Aktualnie kont na węźle: <strong className="text-white">{accountCount}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => save({ accepts: !accepts })}
          disabled={pending}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            accepts
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
          }`}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {accepts ? "Cordonuj węzeł" : "Wznów przyjmowanie"}
        </button>
      </div>

      {/* Limits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Maks. liczba kont (puste = bez limitu)</span>
          <input
            value={maxAcc}
            onChange={(e) => setMaxAcc(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="np. 200"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Rezerwa headroom (% pod burst autoskalowania)</span>
          <input
            value={headroom}
            onChange={(e) => setHeadroom(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0–90"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
      </div>

      {/* Z-12 — nadsubskrypcja pojemności */}
      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="text-xs font-medium text-white">Nadsubskrypcja pojemności (Z-12)</div>
        <p className="text-[11px] text-muted-foreground">
          Ile razy węzeł może <strong>sprzedać</strong> ponad swoją pojemność fizyczną.
          W LVE limity RAM i CPU są sufitami burst, nie rezerwacjami, więc 1,0 oznacza,
          że węzeł rezerwuje pełny limit planu na każde konto — przy bazie 8&nbsp;GB daje to
          16 kont na maszynie ze 128&nbsp;GB. Osobna bramka i tak nie wpuści konta, gdy
          <strong> realne</strong> zużycie przekroczy pojemność minus headroom.
        </p>
        <p className="text-[11px] text-amber-200/80">
          Dysk ma niższy limit (maks. 3,0), bo quota dyskowa jest realnie egzekwowana —
          klient może ją wypełnić w całości, a miejsca nie da się wtedy odzyskać inaczej
          niż migracją kont.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {(
            [
              ["CPU", ocCpu, setOcCpu, "1–8"],
              ["RAM", ocRam, setOcRam, "1–8"],
              ["Dysk", ocDisk, setOcDisk, "1–3"],
            ] as const
          ).map(([etykieta, wartosc, ustaw, zakres]) => (
            <label key={etykieta} className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {etykieta} ({zakres})
              </span>
              <input
                value={wartosc}
                onChange={(e) => ustaw(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="1"
                inputMode="decimal"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save()}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
          Zapisz limity
        </button>
        {ok ? <span className="text-xs text-emerald-300">Zapisano.</span> : null}
        {error ? <span className="text-xs text-rose-300">{error}</span> : null}
      </div>
    </div>
  );
}

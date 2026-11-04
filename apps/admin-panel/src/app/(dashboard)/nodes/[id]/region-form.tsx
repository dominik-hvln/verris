"use client";

import { Select } from "@/components/select";
import { useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { LOKALIZACJA_DANYCH_KLIENTA, REGIONY_DANYCH } from "@verris/contracts";
import { setNodeRegion } from "../actions";

/**
 * P-13 — lokalizacja węzła (informacja operatora: faktyczne centrum danych, nie nazwa węzła).
 * P5-11 (decyzja 3.11.2026) — klient widzi przy usłudze tylko „Unia Europejska”, bez regionu i miasta.
 */
export function RegionForm({ serverId, region }: { serverId: string; region: string | null }) {
  const [wartosc, setWartosc] = useState(region && region in REGIONY_DANYCH ? region : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const niepoprawny = !!region && !(region in REGIONY_DANYCH);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-white">
        <MapPin className="h-4 w-4" /> Lokalizacja danych
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Region widzi tylko zespół. Klienci na tym węźle widzą w panelu: <span className="text-white">{LOKALIZACJA_DANYCH_KLIENTA}</span>
      </p>
      {niepoprawny ? (
        <p className="mb-3 text-sm text-amber-300">
          Zapisany region „{region}” nie jest kodem centrum danych. Wybierz właściwy.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Region centrum danych"
          value={wartosc}
          onChange={setWartosc}
          className="form-input max-w-md"
          options={[
            { value: "", label: "— nie wybrano —" },
            ...Object.entries(REGIONY_DANYCH).map(([kod, opis]) => ({ value: kod, label: `${kod} — ${opis}` })),
          ]}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setNodeRegion(serverId, wartosc);
              setMsg(r.ok ? "Zapisano." : r.error ?? "Nie udało się zapisać.");
            })
          }
          className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          Zapisz
        </button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
    </section>
  );
}

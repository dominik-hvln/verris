"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { normalizujCve, type WagaPoprawki } from "@verris/contracts";
import { potwierdz } from "@/components/potwierdz";
import { Checkbox } from "@/components/checkbox";
import { KARTA } from "@/components/v2";
import { pobierzAktualizacje, zainstalujPoprawki, type PodsumowanieAktualizacji } from "./actions";

const WAGA: Record<WagaPoprawki, { tekst: string; klasa: string }> = {
  Critical: { tekst: "Krytyczna", klasa: "border-rose-500/40 text-rose-200" },
  Important: { tekst: "Ważna", klasa: "border-amber-500/40 text-amber-200" },
  Moderate: { tekst: "Umiarkowana", klasa: "border-white/15 text-neutral-200" },
  Low: { tekst: "Niska", klasa: "border-white/10 text-muted-foreground" },
  Unknown: { tekst: "Bez wagi", klasa: "border-white/10 text-muted-foreground" },
};

const DANE: Record<"swieze" | "stare" | "brak", string> = {
  swieze: "aktualny raport",
  stare: "raport starszy niż doba",
  brak: "brak raportu",
};

const czas = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : "—";

const PRZYCISK =
  "inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-line-strong bg-transparent px-3.5 text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50";

/**
 * 21.10 — weryfikator aktualizacji bezpieczeństwa: oczekujące poprawki floty z raportów agenta, wyszukiwanie po CVE
 * i fala samych poprawek (kanarek → reszta). `bezInstalacji` — powód wyszarzenia przycisków (brak NODES_MANAGE).
 */
export function AktualizacjePanel({ start, bezInstalacji }: { start: PodsumowanieAktualizacji; bezInstalacji: string | null }) {
  const [dane, setDane] = useState(start);
  const [cve, setCve] = useState("");
  const [custombuild, setCustombuild] = useState(false);
  const [komunikat, setKomunikat] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, startT] = useTransition();
  const wynikCve = dane.cve;

  const sprawdz = (e: React.FormEvent) => {
    e.preventDefault();
    const n = normalizujCve(cve);
    if (!n) {
      setKomunikat({ ok: false, tekst: "Wpisz numer w postaci CVE-2026-12345." });
      return;
    }
    setKomunikat(null);
    startT(async () => {
      const w = await pobierzAktualizacje(n);
      if (w.ok) setDane(w.data);
      else setKomunikat({ ok: false, tekst: w.error });
    });
  };

  const instaluj = async (zakres: { cve?: string[]; serwery?: string[] }) => {
    const opis = zakres.cve?.length
      ? `Zainstalować poprawki dla ${zakres.cve.join(", ")} na ${zakres.serwery?.length ?? "wszystkich"} węzłach?`
      : "Zainstalować wszystkie oczekujące poprawki bezpieczeństwa na całej flocie?";
    const dalej = await potwierdz(
      `${opis} Najpierw węzeł kanarkowy, potem pozostałe po jednym; po poprawkach LiteSpeed zrestartuje się łagodnie, a strażnik sprawdzi strony. Błąd zatrzymuje falę.${custombuild ? " Zaktualizujemy też składniki CustomBuild." : ""}`,
      { akcja: "Zainstaluj poprawki", niebezpieczne: true },
    );
    if (!dalej) return;
    startT(async () => {
      const w = await zainstalujPoprawki({ ...zakres, ...(custombuild ? { custombuild: true } : {}) });
      if (w.ok) {
        setKomunikat({
          ok: true,
          tekst: w.data.queued
            ? `Fala poprawek ruszyła od węzła kanarkowego (pominięto bez agenta: ${w.data.skipped}).`
            : `Brak węzłów z agentem (pominięto ${w.data.skipped}).`,
        });
      } else setKomunikat({ ok: false, tekst: w.error });
    });
  };

  const zKustombuild = dane.wezly.filter((w) => w.custombuild.length || w.bladCustomBuild);
  const zablokowane = !!bezInstalacji || pending;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Węzły z krytycznymi lub ważnymi poprawkami", dane.kafelki.wezlowZWaznymi],
          ["Oczekujące poprawki (advisory)", dane.kafelki.poprawek],
          ["Węzły bez świeżych danych", dane.kafelki.wezlowBezDanych],
        ].map(([l, n]) => (
          <div key={String(l)} className={`${KARTA} px-5 py-4`} data-kafelek>
            <div className="text-2xl font-bold text-white">{n}</div>
            <div className="mt-1 text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby="cve-h">
        <h2 id="cve-h" className="font-display text-[17px] font-bold">Sprawdź CVE</h2>
        <form onSubmit={sprawdz} className="flex flex-wrap items-center gap-2">
          <input
            value={cve}
            onChange={(e) => setCve(e.target.value)}
            placeholder="CVE-2026-12345"
            aria-label="Numer CVE"
            data-pole-cve
            className="h-[38px] w-64 rounded-[9px] border border-line bg-transparent px-3 font-mono text-sm text-foreground outline-none focus:border-primary"
          />
          <button type="submit" disabled={pending} className={PRZYCISK} data-sprawdz-cve>
            Sprawdź
          </button>
        </form>
        {wynikCve ? (
          <div className="flex flex-col gap-2 text-sm" data-wynik-cve>
            <p className={wynikCve.doZalatania.length ? "text-amber-200" : "text-muted-foreground"}>{wynikCve.komunikat}</p>
            {wynikCve.doZalatania.length ? (
              <ul className="list-disc pl-5">
                {wynikCve.doZalatania.map((w) => (
                  <li key={w.id}>
                    <Link href={`/nodes/${w.id}`} className="font-semibold text-white hover:underline">{w.nazwa}</Link>{" "}
                    <span className="text-muted-foreground">— {w.advisory.join(", ")}: {w.pakiety.join(", ")}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {wynikCve.bezDanych.length ? (
              <p className="text-xs text-amber-200">Bez świeżych danych (nie wiadomo): {wynikCve.bezDanych.map((w) => w.nazwa).join(", ")}</p>
            ) : null}
            {wynikCve.doZalatania.length ? (
              <div>
                <button
                  type="button"
                  disabled={zablokowane}
                  title={bezInstalacji ?? undefined}
                  onClick={() => void instaluj({ cve: [wynikCve.cve], serwery: wynikCve.doZalatania.map((w) => w.id) })}
                  className={PRZYCISK}
                  data-instaluj-cve
                >
                  Zainstaluj tylko dla {wynikCve.cve}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby="poprawki-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="poprawki-h" className="font-display text-[17px] font-bold">Oczekujące poprawki</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={custombuild} onChange={(e) => setCustombuild(e.target.checked)} data-custombuild />
              także składniki CustomBuild
            </label>
            <button type="button" disabled={zablokowane} title={bezInstalacji ?? undefined} onClick={() => void instaluj({})} className={PRZYCISK} data-instaluj-wszystkie>
              Zainstaluj poprawki bezpieczeństwa
            </button>
          </div>
        </div>
        {komunikat ? <p className={`text-sm ${komunikat.ok ? "text-emerald-300" : "text-rose-300"}`} role="status">{komunikat.tekst}</p> : null}
        {dane.poprawki.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Węzły ze świeżym raportem nie mają oczekujących poprawek bezpieczeństwa.
            {dane.kafelki.wezlowBezDanych ? ` ${dane.kafelki.wezlowBezDanych} węzłów nie ma świeżego raportu — dla nich nie wiadomo.` : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white" data-tabela-poprawek>
              <thead className="border-b border-white/10 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Advisory</th>
                  <th className="px-3 py-2 font-medium">Waga</th>
                  <th className="px-3 py-2 font-medium">CVE</th>
                  <th className="px-3 py-2 font-medium">Pakiety</th>
                  <th className="px-3 py-2 font-medium">Węzły</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {dane.poprawki.map((p) => (
                  <tr key={p.advisory}>
                    <td className="px-3 py-2 font-mono text-xs">{p.advisory}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${WAGA[p.waga].klasa}`}>{WAGA[p.waga].tekst}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.cve.length ? p.cve.join(", ") : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.pakiety.join(", ")}</td>
                    <td className="px-3 py-2 text-xs">{p.wezly.map((w) => w.nazwa).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby="wezly-h">
        <h2 id="wezly-h" className="font-display text-[17px] font-bold">Węzły</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Węzeł</th>
                <th className="px-3 py-2 font-medium">Raport</th>
                <th className="px-3 py-2 font-medium">Poprawki</th>
                <th className="px-3 py-2 font-medium">PHP (alt-php)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {dane.wezly.map((w) => (
                <tr key={w.id} data-wezel={w.id}>
                  <td className="px-3 py-2">
                    <Link href={`/nodes/${w.id}`} className="font-semibold hover:underline">{w.nazwa}</Link>
                  </td>
                  <td className={`px-3 py-2 text-xs ${w.dane === "swieze" ? "text-muted-foreground" : "text-amber-200"}`}>
                    {DANE[w.dane]}
                    {w.sprawdzono ? ` · ${czas(w.sprawdzono)}` : ""}
                    {w.bladDnf ? <span className="block text-rose-300">dnf: {w.bladDnf}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {w.dane === "brak" ? "—" : `${w.poprawek} (ważnych: ${w.waznych})`}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {Object.keys(w.altPhp).length ? Object.entries(w.altPhp).map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby="cb-h">
        <h2 id="cb-h" className="font-display text-[17px] font-bold">Składniki CustomBuild</h2>
        <p className="text-sm text-muted-foreground">Exim, Dovecot, PHP systemowe i LiteSpeed nie przychodzą z repozytoriów — instalują się z opcją „także składniki CustomBuild”.</p>
        {zKustombuild.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak dostępnych aktualizacji w raportach.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm" data-custombuild-lista>
            {zKustombuild.map((w) => (
              <li key={w.id}>
                <span className="font-semibold">{w.nazwa}</span>
                {w.bladCustomBuild ? <span className="ml-2 text-xs text-rose-300">{w.bladCustomBuild}</span> : null}
                {w.custombuild.length ? (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{w.custombuild.map((c) => `${c.nazwa} ${c.z} → ${c.na}`).join(" · ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

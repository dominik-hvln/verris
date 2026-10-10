"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { years as lataTekst } from "@/lib/pl";
import { Select } from "@/components/select";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { brakUprawnienia, type DostepDoAkcji, type WarunekUprawnien } from "@/lib/akcje/wezel";
import { akcjaDomenyAction, synchronizujDomeneAction, wycenaOdnowieniaAction, type AkcjaDomeny, type Wynik } from "../actions";

/**
 * F2.7 (D2/D3/D8) — operacje na domenie u rejestratora z karty domeny. Każda zmiana z powodem (min. 10 znaków)
 * i opcjonalnym numerem zgłoszenia; klient widzi w aktywności „obsługa Verris (zgłoszenie #…)”. Uprawnienia jak
 * w API: DOMAINS_MANAGE (L3); odnowienie na koszt Verris — także BILLING_MANAGE (L4) albo administrator. Bez
 * uprawnienia przycisk jest wyszarzony z informacją, czego brakuje.
 */
export type RodzajDzialania = "synchronizuj" | "blokada" | "kod-epp" | "ns" | "odnow" | "odnow-verris";

export const PRZYCISKI_DOMENY: ReadonlyArray<{ id: RodzajDzialania; nazwa: (zablokowana: boolean) => string; perm: WarunekUprawnien }> = [
  { id: "synchronizuj", nazwa: () => "Synchronizuj", perm: "DOMAINS_MANAGE" },
  { id: "odnow", nazwa: () => "Odnów z portfela klienta", perm: "DOMAINS_MANAGE" },
  { id: "odnow-verris", nazwa: () => "Odnów na koszt Verris", perm: { wszystkie: ["DOMAINS_MANAGE", "BILLING_MANAGE"] } },
  { id: "blokada", nazwa: (z) => (z ? "Zdejmij blokadę transferu" : "Włącz blokadę transferu"), perm: "DOMAINS_MANAGE" },
  { id: "kod-epp", nazwa: () => "Pokaż kod EPP", perm: "DOMAINS_MANAGE" },
  { id: "ns", nazwa: () => "Zmień NS", perm: "DOMAINS_MANAGE" },
];

const MIN_POWOD = 10;
const POLE = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";
const zl = (v: string) => `${Number(v).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

/** Komunikat po synchronizacji: co się zmieniło (albo że nic). */
export function opisSynchronizacji(w: { odeszla: boolean; zmiany: Record<string, { z: unknown; na: unknown }> }): string {
  if (w.odeszla) return "Rejestrator nie ma już tej domeny — oznaczona jako odeszła.";
  const nazwy: Record<string, string> = { expiresAt: "data wygaśnięcia", transferLock: "blokada transferu", whoisPrivacy: "ukrycie WHOIS" };
  const lista = Object.keys(w.zmiany).map((k) => nazwy[k] ?? k);
  return lista.length ? `Zaktualizowano: ${lista.join(", ")}.` : "Dane zgodne z rejestratorem — bez zmian.";
}

export function DzialaniaDomeny(p: {
  domainId: string;
  domena: string;
  transferLock: boolean;
  nameservers: string[];
  saldoKlienta: string;
  dostep: DostepDoAkcji;
}) {
  const router = useRouter();
  const [aktywna, setAktywna] = useState<RodzajDzialania | null>(null);
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [lata, setLata] = useState("1");
  const [wycena, setWycena] = useState<{ priceAmount: string } | null>(null);
  const [ns, setNs] = useState(p.nameservers.join("\n"));
  const [kod, setKod] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const bezpiecznie = async <T,>(f: () => Promise<Wynik<T>>): Promise<Wynik<T>> => {
    try {
      return await f();
    } catch {
      return { ok: false, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." };
    }
  };

  const pobierzWycene = (n: string) =>
    start(async () => {
      setWycena(null);
      const r = await bezpiecznie(() => wycenaOdnowieniaAction(p.domainId, Number(n)));
      if (r.ok) setWycena(r.wynik);
      else setMsg({ ok: false, tekst: r.error });
    });

  const otworz = (r: RodzajDzialania) => {
    setMsg(null);
    setKod(null);
    if (r === "synchronizuj") {
      setAktywna(null);
      start(async () => {
        const w = await bezpiecznie(() => synchronizujDomeneAction(p.domainId));
        setMsg(w.ok ? { ok: true, tekst: opisSynchronizacji(w.wynik) } : { ok: false, tekst: w.error });
        if (w.ok) router.refresh();
      });
      return;
    }
    setAktywna(r);
    if (r === "odnow" || r === "odnow-verris") pobierzWycene(lata);
  };

  const wykonaj = async (akcja: AkcjaDomeny, pola: Record<string, unknown>, pytanie: string, niebezpieczne = false) => {
    if (!(await potwierdz(`${pytanie} Klient zobaczy w aktywności konta wpis „obsługa Verris”.`, { akcja: "Wykonaj", niebezpieczne }))) return;
    start(async () => {
      const r = await bezpiecznie(() => akcjaDomenyAction(p.domainId, akcja, { ...pola, powod, zgloszenie }));
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setPowod("");
      setZgloszenie("");
      if (akcja === "kod-epp") {
        setKod((r.wynik as { authCode: string }).authCode);
        setMsg({ ok: true, tekst: "Kod pokazany — przekaż go klientowi w zgłoszeniu. W dzienniku zostaje tylko fakt pokazania." });
        return;
      }
      setAktywna(null);
      setMsg({ ok: true, tekst: akcja === "blokada" ? "Blokada zmieniona u rejestratora." : akcja === "ns" ? "Serwery nazw zmienione u rejestratora." : "Domena odnowiona." });
      router.refresh();
    });
  };

  const powodOk = powod.trim().length >= MIN_POWOD;
  const blokada = pending || !powodOk;
  const listaNs = ns.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const przycisk = (on: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs disabled:opacity-50 ${on ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-neutral-300 hover:text-white"}`;
  const wykonajPrzycisk = (etykieta: string, onClick: () => void, wylaczony = blokada) => (
    <button
      type="button"
      data-wykonaj={aktywna ?? ""}
      disabled={wylaczony}
      title={powodOk ? undefined : "Najpierw wpisz powód"}
      onClick={onClick}
      className="rounded-md border border-cyan-400/60 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
    >
      {etykieta}
    </button>
  );
  const n = Number(lata);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5" role="region" aria-labelledby="dzialania-domeny-naglowek" id="dzialania">
      <div className="flex items-center gap-2">
        <h2 id="dzialania-domeny-naglowek" className="text-sm font-semibold text-white">
          Operacje u rejestratora
        </h2>
        <Pomoc id="odnowienie-domeny" />
      </div>
      <p className="text-xs text-muted-foreground">Powód zapisuje się w dzienniku zespołu; klient widzi wpis „obsługa Verris” z numerem zgłoszenia, bez powodu.</p>

      <div className="mt-4 flex flex-wrap gap-1.5" role="toolbar" aria-label="Operacje na domenie">
        {PRZYCISKI_DOMENY.map((b) => {
          const brak = brakUprawnienia(b.perm, p.dostep);
          return (
            <button
              key={b.id}
              id={`akcja-${b.id}`}
              type="button"
              data-akcja={b.id}
              disabled={!!brak || pending}
              title={brak ?? undefined}
              aria-pressed={aktywna === b.id}
              onClick={() => otworz(b.id)}
              className={przycisk(aktywna === b.id)}
            >
              {b.nazwa(p.transferLock)}
            </button>
          );
        })}
      </div>

      {aktywna ? (
        <div className="mt-4 space-y-3" data-formularz={aktywna}>
          {aktywna === "odnow" || aktywna === "odnow-verris" ? (
            <div className="space-y-2">
              <Select
                value={lata}
                onChange={(v) => {
                  setLata(v);
                  pobierzWycene(v);
                }}
                options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: lataTekst(i + 1) }))}
                disabled={pending}
                aria-label="Okres odnowienia"
                wrapperClassName="w-40"
              />
              {wycena ? (
                <p className="text-xs text-muted-foreground" data-wycena="">
                  {aktywna === "odnow"
                    ? `Opłata z portfela klienta: ${zl(wycena.priceAmount)} (saldo: ${zl(p.saldoKlienta)}).`
                    : `Wartość odnowienia: ${zl(wycena.priceAmount)} — klient nie zapłaci nic, koszt ponosi Verris.`}
                </p>
              ) : null}
              {aktywna === "odnow" && wycena && Number(p.saldoKlienta) < Number(wycena.priceAmount) ? (
                <p className="text-xs text-amber-200">Klient ma za mało środków — rejestrator nie zostanie wywołany, dopóki nie doładuje portfela.</p>
              ) : null}
            </div>
          ) : null}
          {aktywna === "blokada" ? (
            <p className="text-xs text-muted-foreground">
              {p.transferLock ? "Zdjęcie blokady pozwala przenieść domenę do innego rejestratora." : "Blokada uniemożliwia transfer domeny bez jej zdjęcia."}
            </p>
          ) : null}
          {aktywna === "kod-epp" ? (
            <p className="text-xs text-muted-foreground">
              {p.transferLock ? "Domena ma blokadę transferu — do przeniesienia trzeba ją też zdjąć." : "Kod pozwala przenieść domenę do innego rejestratora."}
            </p>
          ) : null}
          {aktywna === "ns" ? (
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Serwery nazw (2–8, każdy w osobnej linii)</span>
              <textarea value={ns} onChange={(e) => setNs(e.target.value)} rows={4} disabled={pending} className={`${POLE} max-w-md font-mono`} aria-label="Serwery nazw" />
            </label>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Powód do dziennika (obowiązkowy, min. {MIN_POWOD} znaków)</span>
            <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder="np. klient prosi w zgłoszeniu o kod do przeniesienia" className={POLE} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Numer zgłoszenia klienta (jeśli jest)</span>
            <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={pending} placeholder="#ab12cd34" className={`${POLE} max-w-xs font-mono`} />
          </label>

          {aktywna === "odnow"
            ? wykonajPrzycisk("Odnów", () =>
                void wykonaj("odnow", { years: n }, `Odnowić ${p.domena} o ${lataTekst(n)}${wycena ? ` za ${zl(wycena.priceAmount)} z portfela klienta` : " z portfela klienta"}?`),
              )
            : null}
          {aktywna === "odnow-verris"
            ? wykonajPrzycisk("Odnów na koszt Verris", () =>
                void wykonaj(
                  "odnow-na-koszt-verris",
                  { years: n },
                  `Odnowić ${p.domena} o ${lataTekst(n)} na koszt Verris${wycena ? ` (${zl(wycena.priceAmount)})` : ""}? Klient nie zapłaci nic.`,
                  true,
                ),
              )
            : null}
          {aktywna === "blokada"
            ? wykonajPrzycisk(p.transferLock ? "Zdejmij blokadę" : "Włącz blokadę", () =>
                void wykonaj("blokada", { locked: !p.transferLock }, p.transferLock ? `Zdjąć blokadę transferu ${p.domena}?` : `Włączyć blokadę transferu ${p.domena}?`, p.transferLock),
              )
            : null}
          {aktywna === "kod-epp" ? wykonajPrzycisk("Pokaż kod", () => void wykonaj("kod-epp", {}, `Pokazać kod EPP domeny ${p.domena}?`)) : null}
          {aktywna === "ns"
            ? wykonajPrzycisk(
                "Zmień NS",
                () => void wykonaj("ns", { nameservers: listaNs }, `Ustawić serwery nazw ${p.domena}: ${listaNs.join(", ")}? Zła zmiana wyłączy stronę i pocztę.`, true),
                blokada || listaNs.length < 2 || listaNs.length > 8,
              )
            : null}
          {kod ? (
            <p className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white" data-kod-epp="">
              {kod}
            </p>
          ) : null}
        </div>
      ) : null}
      {msg ? (
        <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}

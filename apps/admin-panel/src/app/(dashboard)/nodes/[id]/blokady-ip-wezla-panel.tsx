"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { KARTA } from "@/components/v2";
import { POLE, kiedy } from "@/components/kolejka-poczty";
import { plForm } from "@/lib/pl";
import { blokadyIpWezlaAction, type AkcjaBlokad, type Wynik } from "./blokady-ip-wezla-actions";

/**
 * F3.2 (D5) — zakładka „Bezpieczeństwo” karty węzła: zablokowane adresy (jail → powód, od–do), odblokowanie dowolnego
 * adresu i biała lista (adresy, których serwer nie blokuje). Tylko IP_BLOCKS_NODE (NOC) i ADMIN — strona pokazuje
 * panel tylko im. Każda zmiana z powodem w dzienniku; „Zablokowało mi IP” klienta jest na karcie usługi.
 */
type Blokada = { ip: string; jail: string; powod: string; od: string | null; do: string | null; stala: boolean };
export type StanBlokadWezla = {
  wToku: boolean;
  lista: { kiedy: string; jaile: string[]; blokady: Blokada[]; razem: number | null; pokazano: number | null; bialaLista: string[] } | null;
  operacja: { tryb: string; ip: string; wToku: boolean; kiedy: string; odblokowano: number | null; blad: string | null } | null;
  blad: string | null;
};

const MIN_POWOD = 10;
const TRYB: Record<string, string> = { unban: "odblokowanie", allow: "dodanie do białej listy", disallow: "usunięcie z białej listy", list: "odczyt" };
const BLAD_POLACZENIA = "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę.";
const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";

export function BlokadyIpWezlaPanel({ serverId }: { serverId: string }) {
  const [stan, setStan] = useState<StanBlokadWezla | null>(null);
  const [ip, setIp] = useState("");
  const [powod, setPowod] = useState("");
  const [filtr, setFiltr] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const wywolaj = useCallback(
    async (co: AkcjaBlokad, dane: { ip?: string; powod?: string } = {}) => {
      let r: Wynik;
      try {
        r = await blokadyIpWezlaAction(serverId, co, dane);
      } catch {
        r = { ok: false, error: BLAD_POLACZENIA };
      }
      if (!r.ok) {
        setMsg({ ok: false, tekst: r.error });
        return false;
      }
      setStan(r.wynik as StanBlokadWezla);
      return true;
    },
    [serverId],
  );

  useEffect(() => {
    void blokadyIpWezlaAction(serverId, "stan")
      .catch(() => ({ ok: false as const, error: BLAD_POLACZENIA }))
      .then((r) => (r.ok ? setStan(r.wynik as StanBlokadWezla) : setMsg({ ok: false, tekst: r.error })));
  }, [serverId]);

  const trwa = !!stan?.wToku;
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void wywolaj("stan"), 5000);
    return () => clearInterval(t);
  }, [trwa, wywolaj]);

  const zmien = async (co: "odblokuj" | "dodaj" | "usun", adres: string) => {
    const tresc =
      co === "odblokuj"
        ? `Odblokować adres ${adres} na węźle (wszystkie usługi)?`
        : co === "dodaj"
          ? `Dodać ${adres} do białej listy? Serwer przestanie blokować ten adres nawet przy zgadywaniu haseł — tylko dla zaufanych adresów (np. biuro klienta, monitoring).`
          : `Usunąć ${adres} z białej listy? Serwer znów będzie go blokował po nieudanych logowaniach.`;
    if (!(await potwierdz(tresc, { akcja: co === "odblokuj" ? "Odblokuj" : co === "dodaj" ? "Dodaj" : "Usuń", niebezpieczne: co === "dodaj" }))) return;
    start(async () => {
      setMsg(null);
      if (await wywolaj(co, { ip: adres, powod })) {
        setPowod("");
        setMsg({ ok: true, tekst: "Zlecone — serwer wykona zmianę w ciągu minuty." });
      }
    });
  };

  const powodOk = powod.trim().length >= MIN_POWOD;
  const lista = stan?.lista;
  const widoczne = useMemo(() => (lista?.blokady ?? []).filter((b) => !filtr.trim() || b.ip.includes(filtr.trim()) || b.jail.includes(filtr.trim())), [lista, filtr]);
  const op = stan?.operacja;

  return (
    <div className={`${KARTA} space-y-4 p-5`} role="region" aria-labelledby="blokady-ip-naglowek">
      <div className="flex items-center gap-2">
        <h2 id="blokady-ip-naglowek" className="text-sm font-semibold">
          Blokady IP
        </h2>
        <Pomoc id="blokady-ip-wezla" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-akcja="wczytaj" className={przycisk} disabled={pending || trwa} onClick={() => start(async () => void (await wywolaj("wczytaj")))}>
          {trwa ? "Trwa operacja…" : "Wczytaj z serwera"}
        </button>
        <span className="text-xs text-muted-foreground">
          {lista ? `stan z ${kiedy(lista.kiedy)} · ${lista.razem ?? lista.blokady.length} ${plForm(lista.razem ?? lista.blokady.length, "blokada", "blokady", "blokad")}` : "jeszcze nie wczytano"}
        </span>
      </div>
      {stan?.blad ? <p className="text-xs text-rose-200">Ostatnia operacja nie powiodła się: {stan.blad}</p> : null}

      <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
        <input value={ip} onChange={(e) => setIp(e.target.value)} maxLength={45} disabled={pending} placeholder="Adres IP" aria-label="Adres IP" className={`${POLE} font-mono`} />
        <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder={`Powód do dziennika (min. ${MIN_POWOD} znaków)`} aria-label="Powód" className={POLE} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(["odblokuj", "dodaj", "usun"] as const).map((co) => (
          <button key={co} type="button" data-akcja={co} className={przycisk} disabled={pending || trwa || !ip.trim() || !powodOk} title={powodOk ? undefined : "Najpierw wpisz powód"} onClick={() => void zmien(co, ip.trim())}>
            {co === "odblokuj" ? "Odblokuj" : co === "dodaj" ? "Dodaj do białej listy" : "Usuń z białej listy"}
          </button>
        ))}
      </div>
      {op ? (
        <p className="text-xs text-muted-foreground" data-operacja="wynik">
          Ostatnie {TRYB[op.tryb] ?? op.tryb} {op.ip} ({kiedy(op.kiedy)}):{" "}
          {op.wToku ? "w toku…" : op.blad ? `nie powiodło się — ${op.blad}` : op.odblokowano !== null ? `zdjęto ${op.odblokowano} ${plForm(op.odblokowano, "blokadę", "blokady", "blokad")}.` : "gotowe."}
        </p>
      ) : null}

      {lista ? (
        <>
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-neutral-300">Biała lista</h3>
            {lista.bialaLista.length ? (
              <ul className="flex flex-wrap gap-1.5 font-mono text-xs" data-biala-lista>
                {lista.bialaLista.map((a) => (
                  <li key={a}>
                    <button type="button" className={przycisk} onClick={() => setIp(a)}>
                      {a}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Pusta.</p>
            )}
          </div>
          {lista.blokady.length ? (
            <>
              <input value={filtr} onChange={(e) => setFiltr(e.target.value)} placeholder="Filtr: adres albo usługa" aria-label="Filtr blokad" className={`${POLE} max-w-xs`} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1">Adres</th>
                      <th className="px-2 py-1">Powód</th>
                      <th className="px-2 py-1">Od</th>
                      <th className="px-2 py-1">Do</th>
                      <th className="px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {widoczne.map((b) => (
                      <tr key={`${b.ip}-${b.jail}`} data-blokada={b.ip}>
                        <td className="px-2 py-1 font-mono">{b.ip}</td>
                        <td className="px-2 py-1">
                          {b.powod} <span className="font-mono text-muted-foreground">({b.jail})</span>
                        </td>
                        <td className="px-2 py-1">{kiedy(b.od)}</td>
                        <td className="px-2 py-1">{b.stala ? "na stałe" : kiedy(b.do)}</td>
                        <td className="px-2 py-1 text-right">
                          <button type="button" className="text-cyan-300 hover:underline" onClick={() => setIp(b.ip)}>
                            Wybierz
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lista.razem !== null && lista.pokazano !== null && lista.razem > lista.pokazano ? (
                <p className="text-xs text-amber-200">Pokazano {lista.pokazano} z {lista.razem} blokad.</p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-emerald-300">Brak zablokowanych adresów.</p>
          )}
        </>
      ) : null}

      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}

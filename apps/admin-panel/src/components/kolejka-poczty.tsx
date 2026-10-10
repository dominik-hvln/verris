"use client";

import { useState } from "react";
import { Checkbox } from "@/components/checkbox";
import { plForm } from "@/lib/pl";

/**
 * F3.1 — tabela kolejki poczty (konto i węzeł): tylko nagłówki z API (apps/api/src/servers/kolejka-poczty.ts),
 * treści wiadomości panel nie dostaje. Filtr działa na wczytanej liście; fraza dla węzła idzie w zleceniu odczytu.
 */
export type WiadomoscWKolejce = {
  id: string;
  wiek: string;
  rozmiar: string;
  zamrozona: boolean;
  nadawca: string;
  odbiorcy: string;
  temat: string;
};

type Operacja = { wToku: boolean; kiedy: string; blad: string | null; usunieto?: number | null; pominieto?: number | null; przed?: number | null; po?: number | null };

export type StanKolejki = {
  wToku: boolean;
  wczytano: string | null;
  szukaj: string | null;
  podsumowanie: { wKolejce: number; przeczytano: number; pasuje: number; pokazano: number } | null;
  wiadomosci: WiadomoscWKolejce[];
  blad: string | null;
  usuwanie: Operacja | null;
  wypchniecie: Operacja | null;
};

export const POLE = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";
export const kiedy = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL") : "—");

const wiadomosci = (n: number) => `${n} ${plForm(n, "wiadomość", "wiadomości", "wiadomości")}`;

/** Jedno zdanie o stanie odczytu: kiedy, ile w kolejce, ile pasuje. */
export function OpisKolejki({ stan }: { stan: StanKolejki }) {
  const p = stan.podsumowanie;
  return (
    <p className="text-xs text-muted-foreground" data-kolejka="opis">
      {stan.wToku ? "Wczytywanie z serwera… " : null}
      {stan.wczytano ? `Stan z ${kiedy(stan.wczytano)}` : "Kolejka nie była jeszcze wczytana."}
      {p ? ` · w kolejce węzła: ${p.wKolejce} · pasuje: ${p.pasuje}${p.pasuje > p.pokazano ? ` (pokazano ${p.pokazano})` : ""}` : null}
      {p && p.przeczytano < p.wKolejce ? ` · sprawdzono ${p.przeczytano} najstarszych` : null}
      {stan.szukaj ? ` · fraza „${stan.szukaj}”` : null}
    </p>
  );
}

export function TabelaKolejki({
  stan,
  zaznaczone,
  onZaznacz,
}: {
  stan: StanKolejki;
  /** Zaznaczanie do usunięcia — tylko w kolejce konta i tylko z uprawnieniem. */
  zaznaczone?: Set<string>;
  onZaznacz?: (ids: Set<string>) => void;
}) {
  const [filtr, setFiltr] = useState("");
  const f = filtr.trim().toLowerCase();
  const widoczne = f ? stan.wiadomosci.filter((m) => `${m.id} ${m.nadawca} ${m.odbiorcy} ${m.temat}`.toLowerCase().includes(f)) : stan.wiadomosci;
  if (!stan.wiadomosci.length) {
    return stan.wczytano ? <p className="text-xs text-emerald-300">Brak wiadomości w kolejce.</p> : null;
  }
  const wszystkie = !!zaznaczone && widoczne.length > 0 && widoczne.every((m) => zaznaczone.has(m.id));
  return (
    <div className="space-y-2">
      <input value={filtr} onChange={(e) => setFiltr(e.target.value)} placeholder="Szukaj w wczytanych: nadawca, odbiorca, temat, id" aria-label="Szukaj w kolejce" className={`${POLE} max-w-md`} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-white" data-kolejka="tabela">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {onZaznacz ? (
                <th className="px-2 py-1">
                  <Checkbox
                    aria-label="Zaznacz widoczne"
                    checked={wszystkie}
                    onChange={() => onZaznacz(wszystkie ? new Set() : new Set(widoczne.map((m) => m.id)))}
                  />
                </th>
              ) : null}
              <th className="px-2 py-1">Wiek</th>
              <th className="px-2 py-1">Nadawca</th>
              <th className="px-2 py-1">Odbiorcy</th>
              <th className="px-2 py-1">Temat</th>
              <th className="px-2 py-1">Rozmiar</th>
              <th className="px-2 py-1">Id</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {widoczne.map((m) => (
              <tr key={m.id} data-wiadomosc={m.id}>
                {onZaznacz && zaznaczone ? (
                  <td className="px-2 py-1">
                    <Checkbox
                      aria-label={`Zaznacz ${m.id}`}
                      checked={zaznaczone.has(m.id)}
                      onChange={() => {
                        const n = new Set(zaznaczone);
                        if (n.has(m.id)) n.delete(m.id);
                        else n.add(m.id);
                        onZaznacz(n);
                      }}
                    />
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-2 py-1">
                  {m.wiek}
                  {m.zamrozona ? <span className="ml-1 rounded bg-sky-500/20 px-1 text-[10px] text-sky-200">zamrożona</span> : null}
                </td>
                <td className="px-2 py-1 font-mono break-all">{m.nadawca || "<> (zwrot)"}</td>
                <td className="px-2 py-1 font-mono break-all">{m.odbiorcy}</td>
                <td className="px-2 py-1 break-all">{m.temat || "—"}</td>
                <td className="px-2 py-1 font-mono">{m.rozmiar}</td>
                <td className="px-2 py-1 font-mono text-muted-foreground">{m.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {f ? <p className="text-xs text-muted-foreground">Pasuje {wiadomosci(widoczne.length)} z {stan.wiadomosci.length}.</p> : null}
    </div>
  );
}

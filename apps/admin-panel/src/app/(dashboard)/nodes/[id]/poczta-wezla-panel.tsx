"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Pomoc } from "@/components/pomoc";
import { KARTA, Pigulka } from "@/components/v2";
import { kiedy } from "@/components/kolejka-poczty";
import { pocztaWezlaAction } from "./poczta-wezla-actions";

/** Odpowiedź GET admin/servers/:id/poczta/statystyki (apps/api/src/servers/poczta-wezla.admin.controller.ts). */
export interface StatystykiPoczty {
  wToku: boolean;
  kiedy: string | null;
  blad: string | null;
  wynik: {
    nadawcy: Array<{ domena: string; uzytkownik: string | null; wiadomosci: number; odrzucone: number; opoznione: number; konto: { subscriptionId: string; domena: string; login: string } | null }>;
    odrzucenia: Array<{ kod: string | null; serwer: string | null; liczba: number }>;
    okno: { od: string | null; do: string | null; wiadomosci: number } | null;
  } | null;
}

export interface WynikRbl {
  ip: string;
  sprawdzono: string;
  naLiscie: string[];
  nieznane: string[];
  czyste: string[];
}

const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
const okno = (iso: string | null) => (iso ? new Date(`${iso}Z`).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : "—");

/**
 * F3.1 reszta — zakładka „Poczta” węzła (NOC i ADMIN): najwięksi nadawcy i odrzucenia z logu poczty (agregat bez
 * adresów i treści; konto → karta usługi, gdzie jest blokada i limit) oraz sprawdzenie IP węzła na listach RBL.
 */
export function PocztaWezlaPanel({ serverId }: { serverId: string }) {
  const [stan, setStan] = useState<StatystykiPoczty | null>(null);
  const [rbl, setRbl] = useState<WynikRbl | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const wywolaj = useCallback(
    async (co: "statystyki" | "wczytaj") => {
      const r = await pocztaWezlaAction(serverId, co).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." }));
      if (r.ok) setStan(r.wynik as StatystykiPoczty);
      else setMsg(r.error);
    },
    [serverId],
  );

  useEffect(() => {
    void pocztaWezlaAction(serverId, "statystyki")
      .catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." }))
      .then((r) => (r.ok ? setStan(r.wynik as StatystykiPoczty) : setMsg(r.error)));
  }, [serverId]);

  const trwa = !!stan?.wToku;
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void wywolaj("statystyki"), 5000);
    return () => clearInterval(t);
  }, [trwa, wywolaj]);

  const sprawdzRbl = () =>
    start(async () => {
      setMsg(null);
      const r = await pocztaWezlaAction(serverId, "rbl").catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (r.ok) setRbl(r.wynik as WynikRbl);
      else setMsg(r.error);
    });

  const w = stan?.wynik;
  return (
    <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-label="Nadawcy i odrzucenia węzła">
      <h2 className="flex items-center gap-1.5 font-display text-[17px] font-bold">
        Nadawcy i odrzucenia <Pomoc id="nadawcy-wezla" />
      </h2>
      <p className="text-xs text-muted-foreground">Wysyłka na zewnątrz z dziennika poczty serwera (bieżący i poprzedni plik) — bez adresów i treści.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-akcja="wczytaj-statystyki" className={przycisk} disabled={pending || trwa} onClick={() => start(async () => { setMsg(null); await wywolaj("wczytaj"); })}>
          {trwa ? "Wczytuję z serwera…" : "Wczytaj z serwera"}
        </button>
        <button type="button" data-akcja="rbl" className={przycisk} disabled={pending} onClick={sprawdzRbl}>
          Sprawdź IP na listach RBL
        </button>
        {stan?.kiedy ? <span className="text-xs text-muted-foreground">Wczytano {kiedy(stan.kiedy)}</span> : null}
      </div>
      {msg ? <p className="text-sm text-crit" role="alert">{msg}</p> : null}
      {stan?.blad ? <p className="text-sm text-crit" role="alert">Ostatni odczyt nie powiódł się: {stan.blad}</p> : null}

      {rbl ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-rbl>
          <span className="font-mono text-xs">{rbl.ip}</span>
          {rbl.naLiscie.map((z) => (
            <Pigulka key={z} ton="crit" className="!text-xs">na liście: {z}</Pigulka>
          ))}
          {rbl.nieznane.map((z) => (
            <Pigulka key={z} ton="warn" className="!text-xs">brak odpowiedzi: {z}</Pigulka>
          ))}
          {rbl.czyste.map((z) => (
            <Pigulka key={z} ton="ok" className="!text-xs">czysto: {z}</Pigulka>
          ))}
          <span className="text-xs text-muted-foreground">{kiedy(rbl.sprawdzono)}</span>
        </div>
      ) : null}

      {w ? (
        <>
          <p className="text-xs text-muted-foreground">
            Okno dziennika: {okno(w.okno?.od ?? null)} – {okno(w.okno?.do ?? null)} · {w.okno?.wiadomosci ?? 0} wiadomości na zewnątrz
          </p>
          {w.nadawcy.length === 0 ? <p className="text-sm text-muted-foreground">Brak wysyłki na zewnątrz w tym oknie.</p> : null}
          {w.nadawcy.length ? (
            <table className="w-full text-left text-[13px]" data-tabela="nadawcy">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Nadawca</th>
                  <th className="py-1 text-right font-medium">Wiadomości</th>
                  <th className="py-1 text-right font-medium">Odrzucone</th>
                  <th className="py-1 text-right font-medium">Opóźnione</th>
                </tr>
              </thead>
              <tbody>
                {w.nadawcy.map((n) => (
                  <tr key={`${n.domena}|${n.uzytkownik ?? ""}`} className="border-t border-line">
                    <td className="py-1.5">
                      {n.konto ? (
                        <Link href={`/subscriptions/${n.konto.subscriptionId}?sekcja=konto#poczta-konta`} className="font-semibold hover:underline">
                          {n.domena}
                        </Link>
                      ) : (
                        <span>{n.domena}</span>
                      )}
                      {n.uzytkownik ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{n.uzytkownik}</span> : null}
                    </td>
                    <td className="py-1.5 text-right font-mono">{n.wiadomosci}</td>
                    <td className={`py-1.5 text-right font-mono ${n.odrzucone > 0 && n.odrzucone * 5 >= n.wiadomosci ? "text-crit" : ""}`}>{n.odrzucone}</td>
                    <td className="py-1.5 text-right font-mono">{n.opoznione}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {w.odrzucenia.length ? (
            <div className="flex flex-col gap-1" data-tabela="odrzucenia">
              <span className="text-xs font-semibold text-muted-foreground">Najczęstsze odrzucenia</span>
              {w.odrzucenia.map((o) => (
                <span key={`${o.kod}|${o.serwer}`} className="text-[13px]">
                  <span className="font-mono">{o.kod ?? "bez kodu"}</span> · {o.serwer ?? "serwer nieznany"} · {o.liczba}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : !trwa ? (
        <p className="text-sm text-muted-foreground">Nie wczytano jeszcze statystyk z serwera.</p>
      ) : null}
    </section>
  );
}

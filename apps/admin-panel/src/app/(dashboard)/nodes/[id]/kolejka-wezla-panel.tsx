"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { KARTA } from "@/components/v2";
import { OpisKolejki, POLE, TabelaKolejki, kiedy, type StanKolejki } from "@/components/kolejka-poczty";
import { kolejkaWezlaAction, type Wynik } from "./kolejka-wezla-actions";

/**
 * F3.1 (D4) — zakładka „Poczta” karty węzła: kolejka exima całego węzła (nagłówki wszystkich klientów, bez treści),
 * fraza wyszukiwania na serwerze, „Wypchnij kolejkę” (exim -qff) z powodem. Tylko MAIL_QUEUE_NODE (NOC) i ADMIN —
 * strona pokazuje panel tylko im (WymagaUprawnienia na karcie).
 */
export function KolejkaWezlaPanel({ serverId }: { serverId: string }) {
  const [stan, setStan] = useState<StanKolejki | null>(null);
  const [szukaj, setSzukaj] = useState("");
  const [powod, setPowod] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const wywolaj = useCallback(
    async (co: "stan" | "wczytaj" | "wypchnij", dane: { szukaj?: string; powod?: string } = {}) => {
      let r: Wynik;
      try {
        r = await kolejkaWezlaAction(serverId, co, dane);
      } catch {
        r = { ok: false, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." };
      }
      if (!r.ok) {
        setMsg({ ok: false, tekst: r.error });
        return false;
      }
      setStan(r.wynik as StanKolejki);
      return true;
    },
    [serverId],
  );

  useEffect(() => {
    void kolejkaWezlaAction(serverId, "stan")
      .catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." }))
      .then((r) => (r.ok ? setStan(r.wynik as StanKolejki) : setMsg({ ok: false, tekst: r.error })));
  }, [serverId]);

  const trwa = !!stan && (stan.wToku || !!stan.wypchniecie?.wToku);
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void wywolaj("stan"), 5000);
    return () => clearInterval(t);
  }, [trwa, wywolaj]);

  const wypchnij = async () => {
    if (!(await potwierdz("Wypchnąć całą kolejkę węzła (exim -qff)? Serwer spróbuje od razu dostarczyć wszystkie wiadomości, także zamrożone.", { akcja: "Wypchnij" }))) return;
    start(async () => {
      setMsg(null);
      if (await wywolaj("wypchnij", { powod })) {
        setPowod("");
        setMsg({ ok: true, tekst: "Wypchnięcie zlecone — wynik pojawi się poniżej." });
      }
    });
  };

  const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
  const powodOk = powod.trim().length >= 10;
  const w = stan?.wypchniecie;

  return (
    <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-label="Kolejka poczty węzła">
      <h2 className="flex items-center gap-1.5 font-display text-[17px] font-bold">
        Kolejka poczty węzła <Pomoc id="kolejka-wezla" />
      </h2>
      <p className="text-xs text-muted-foreground">Nagłówki wiadomości wszystkich kont na węźle — bez treści. Każdy odczyt zapisuje się w dzienniku.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={szukaj} onChange={(e) => setSzukaj(e.target.value)} maxLength={100} disabled={pending} placeholder="Fraza (opcjonalnie): nadawca, odbiorca, temat" aria-label="Fraza wyszukiwania na serwerze" className={`${POLE} max-w-sm`} />
        <button
          type="button"
          data-akcja="wczytaj"
          className={przycisk}
          disabled={pending || trwa}
          onClick={() =>
            start(async () => {
              setMsg(null);
              await wywolaj("wczytaj", { szukaj });
            })
          }
        >
          {stan?.wToku ? "Wczytywanie…" : "Wczytaj kolejkę"}
        </button>
      </div>
      {stan ? (
        <>
          <OpisKolejki stan={stan} />
          {stan.blad ? <p className="text-xs text-rose-200">Ostatni odczyt nie powiódł się: {stan.blad}</p> : null}
          <TabelaKolejki stan={stan} />
        </>
      ) : null}
      <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
        <label className="block flex-1 space-y-1">
          <span className="text-xs text-neutral-400">Powód wypchnięcia (min. 10 znaków)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder="np. po zdjęciu IP z RBL" className={POLE} />
        </label>
        <button type="button" data-akcja="wypchnij" className={przycisk} disabled={pending || trwa || !powodOk} title={powodOk ? undefined : "Najpierw wpisz powód"} onClick={() => void wypchnij()}>
          Wypchnij kolejkę
        </button>
      </div>
      {w ? (
        <p className="text-xs text-muted-foreground" data-wypchniecie="wynik">
          Ostatnie wypchnięcie ({kiedy(w.kiedy)}): {w.wToku ? "w toku…" : w.blad ? `nie powiodło się — ${w.blad}` : `w kolejce było ${w.przed ?? "?"}, zostało ${w.po ?? "?"}.`}
        </p>
      ) : null}
      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </section>
  );
}

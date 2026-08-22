"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { wystawFaktureReczna, type PozycjaWej } from "./actions";

const STAWKA_VAT = 23;

/** Ten sam podział co w API: netto z brutto, VAT jako reszta. */
function rozbicie(brutto: number): { netto: number; vat: number } {
  const b = Math.round(brutto * 100) / 100;
  const netto = Math.round((b * 100) / (100 + STAWKA_VAT) * 100) / 100;
  return { netto, vat: Math.round((b - netto) * 100) / 100 };
}

const PLN = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Wiersz {
  nazwa: string;
  ilosc: string;
  cenaBrutto: string;
}

const PUSTY: Wiersz = { nazwa: "", ilosc: "1", cenaBrutto: "" };

export function FakturaRecznaForm() {
  const [userId, setUserId] = useState("");
  const [waluta, setWaluta] = useState("PLN");
  const [powod, setPowod] = useState("");
  const [wiersze, setWiersze] = useState<Wiersz[]>([{ ...PUSTY }]);
  const [pending, startTransition] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [numer, setNumer] = useState<string | null>(null);

  const suma = useMemo(() => {
    let brutto = 0;
    let netto = 0;
    let vat = 0;
    for (const w of wiersze) {
      const cena = Number(w.cenaBrutto.replace(",", "."));
      const ilosc = Number(w.ilosc);
      if (!Number.isFinite(cena) || !Number.isFinite(ilosc) || cena <= 0 || ilosc < 1) continue;
      const b = Math.round(cena * ilosc * 100) / 100;
      const r = rozbicie(b);
      brutto += b;
      netto += r.netto;
      vat += r.vat;
    }
    return { brutto, netto, vat };
  }, [wiersze]);

  const gotowe =
    userId.trim().length > 0 &&
    powod.trim().length >= 5 &&
    suma.brutto > 0 &&
    wiersze.some((w) => w.nazwa.trim().length > 0);

  function ustaw(i: number, pole: keyof Wiersz, wartosc: string) {
    setWiersze((prev) => prev.map((w, j) => (j === i ? { ...w, [pole]: wartosc } : w)));
  }

  if (numer) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-6">
        <p className="text-lg font-semibold text-emerald-200">Faktura {numer} wystawiona</p>
        <p className="mt-2 text-sm text-emerald-100/80">
          PDF powstaje w tle i trafia do klienta mailem. Jeżeli po kilku minutach nadal go nie ma,
          zobacz listę faktur — dokument bez pliku jest tam oznaczony, a job ponawia próbę sam.
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/invoices"
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5"
          >
            Wróć do listy
          </Link>
          <button
            type="button"
            onClick={() => {
              setNumer(null);
              setWiersze([{ ...PUSTY }]);
              setPowod("");
            }}
            className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-500/20"
          >
            Wystaw kolejną
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-400">
            Identyfikator klienta
          </span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="uuid użytkownika"
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white placeholder:text-neutral-600"
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            Dane nabywcy zostaną pobrane z konta i zamrożone na fakturze.
          </span>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-400">Waluta</span>
          <select
            value={waluta}
            onChange={(e) => setWaluta(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          >
            {["PLN", "EUR", "USD"].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wide text-neutral-400">Pozycje</h2>
          <span className="text-[11px] text-neutral-500">Ceny podaje się BRUTTO</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-3 py-2 text-left">Nazwa</th>
                <th className="w-24 px-3 py-2 text-right">Ilość</th>
                <th className="w-36 px-3 py-2 text-right">Cena brutto</th>
                <th className="w-32 px-3 py-2 text-right">Wartość</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {wiersze.map((w, i) => {
                const cena = Number(w.cenaBrutto.replace(",", "."));
                const ilosc = Number(w.ilosc);
                const wartosc =
                  Number.isFinite(cena) && Number.isFinite(ilosc) && cena > 0 && ilosc >= 1
                    ? Math.round(cena * ilosc * 100) / 100
                    : null;
                return (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      <input
                        value={w.nazwa}
                        onChange={(e) => ustaw(i, "nazwa", e.target.value)}
                        placeholder="np. Rekompensata za przerwę w dostępności"
                        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white placeholder:text-neutral-600"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={w.ilosc}
                        onChange={(e) => ustaw(i, "ilosc", e.target.value)}
                        inputMode="numeric"
                        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-sm text-white"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={w.cenaBrutto}
                        onChange={(e) => ustaw(i, "cenaBrutto", e.target.value)}
                        inputMode="decimal"
                        placeholder="0,00"
                        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-sm text-white placeholder:text-neutral-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                      {wartosc === null ? "—" : PLN.format(wartosc)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {wiersze.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setWiersze((p) => p.filter((_, j) => j !== i))}
                          className="text-neutral-500 hover:text-red-300"
                          aria-label="Usuń pozycję"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => setWiersze((p) => [...p, { ...PUSTY }])}
          className="mt-2 rounded-md border border-white/10 px-3 py-1 text-xs text-neutral-300 hover:bg-white/5"
        >
          + Dodaj pozycję
        </button>
      </section>

      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-neutral-400">
            <dt>Netto</dt>
            <dd className="tabular-nums">
              {PLN.format(suma.netto)} {waluta}
            </dd>
          </div>
          <div className="flex justify-between text-neutral-400">
            <dt>VAT {STAWKA_VAT}%</dt>
            <dd className="tabular-nums">
              {PLN.format(suma.vat)} {waluta}
            </dd>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-1 font-semibold text-white">
            <dt>Brutto</dt>
            <dd className="tabular-nums">
              {PLN.format(suma.brutto)} {waluta}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-neutral-500">
          Podgląd liczony w przeglądarce tą samą regułą co API: netto z brutto, VAT jako reszta.
          Wiążące jest to, co policzy API przy zapisie.
        </p>
      </section>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-400">
          Powód wystawienia
        </span>
        <textarea
          value={powod}
          onChange={(e) => setPowod(e.target.value)}
          rows={2}
          placeholder="np. rekompensata uzgodniona ze zgłoszenia #1234"
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          Trafia do dziennika audytu, nie na fakturę. Faktura wystawiona ręcznie zawsze jest
          wyjątkiem od reguły, a wyjątek bez uzasadnienia po miesiącu jest nie do odtworzenia.
        </span>
      </label>

      {blad && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {blad}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!gotowe || pending}
          onClick={() => {
            setBlad(null);
            const pozycje: PozycjaWej[] = wiersze
              .filter((w) => w.nazwa.trim() && Number(w.cenaBrutto.replace(",", ".")) > 0)
              .map((w) => ({
                nazwa: w.nazwa.trim(),
                ilosc: Number(w.ilosc),
                cenaBrutto: Number(w.cenaBrutto.replace(",", ".")),
              }));
            startTransition(async () => {
              const res = await wystawFaktureReczna({
                userId: userId.trim(),
                pozycje,
                waluta,
                powod: powod.trim(),
              });
              if (res.ok) setNumer(res.numer);
              else setBlad(res.error);
            });
          }}
          className="rounded-md border border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-100 hover:bg-indigo-500/25 disabled:opacity-40"
        >
          {pending ? "Wystawiam…" : "Wystaw fakturę"}
        </button>
        <Link href="/invoices" className="text-sm text-neutral-400 hover:text-white">
          Anuluj
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { wystawKorekte, type PozycjaKorektyWej } from "./actions";
import type { FakturaDoKorekty } from "./data";

const PLN = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const liczba = (v: string) => Number(String(v).replace(",", "."));

interface Wiersz {
  nazwa: string;
  ilosc: string;
  cenaBrutto: string;
}

export function KorektaForm({ faktura }: { faktura: FakturaDoKorekty }) {
  const [rodzaj, setRodzaj] = useState<"WARTOSCIOWA" | "FORMALNA">("WARTOSCIOWA");
  const [przyczyna, setPrzyczyna] = useState("");
  const [wiersze, setWiersze] = useState<Wiersz[]>(() =>
    (faktura.lineItems ?? []).map((p) => ({
      nazwa: p.name,
      ilosc: String(p.quantity),
      cenaBrutto: (Number(p.totalGross) / Math.max(p.quantity, 1)).toFixed(2),
    })),
  );
  const nabywca = (faktura.buyerSnapshot ?? {}) as Record<string, string>;
  const [nazwaNabywcy, setNazwaNabywcy] = useState(
    String(nabywca.companyName ?? nabywca.name ?? ""),
  );
  const [nipNabywcy, setNipNabywcy] = useState(String(nabywca.nip ?? ""));
  const [adresNabywcy, setAdresNabywcy] = useState(String(nabywca.address ?? ""));

  const [pending, startTransition] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<{ numer: string; zwrot: string } | null>(null);

  const przed = Number(faktura.amount);
  const po = useMemo(
    () =>
      wiersze.reduce((a, w) => {
        const c = liczba(w.cenaBrutto);
        const i = Number(w.ilosc);
        return Number.isFinite(c) && Number.isFinite(i) && c >= 0 && i >= 1
          ? a + Math.round(c * i * 100) / 100
          : a;
      }, 0),
    [wiersze],
  );
  const roznica = Math.round((po - przed) * 100) / 100;

  const gotowe =
    przyczyna.trim().length >= 5 &&
    (rodzaj === "FORMALNA"
      ? nazwaNabywcy.trim().length > 0
      : wiersze.length > 0 && roznica !== 0);

  function ustaw(i: number, pole: keyof Wiersz, v: string) {
    setWiersze((prev) => prev.map((w, j) => (j === i ? { ...w, [pole]: v } : w)));
  }

  if (wynik) {
    const zwrot = Number(wynik.zwrot);
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-6">
        <p className="text-lg font-semibold text-emerald-200">Korekta {wynik.numer} wystawiona</p>
        <p className="mt-2 text-sm text-emerald-100/80">
          {zwrot > 0
            ? `Do portfela klienta wróciło ${PLN.format(zwrot)} ${faktura.currency}. Zapis w księdze powstał w tej samej transakcji co dokument — nie ma drugiego kroku do wykonania.`
            : "Kwoty się nie zmieniły, więc w portfelu nic się nie ruszyło."}
        </p>
        <p className="mt-2 text-xs text-emerald-100/60">
          PDF powstaje w tle i trafia do klienta mailem, tą samą drogą co zwykła faktura.
        </p>
        <Link
          href="/invoices"
          className="mt-4 inline-block rounded-md border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5"
        >
          Wróć do listy faktur
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap gap-2">
        {(
          [
            ["WARTOSCIOWA", "Wartościowa — zmienia kwoty"],
            ["FORMALNA", "Formalna — poprawia dane nabywcy"],
          ] as const
        ).map(([w, label]) => (
          <button
            key={w}
            type="button"
            onClick={() => setRodzaj(w)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              rodzaj === w
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-200"
                : "border-white/10 text-neutral-400 hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </section>

      {rodzaj === "WARTOSCIOWA" ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wide text-neutral-400">Pozycje PO korekcie</h2>
            <span className="text-[11px] text-neutral-500">
              Ceny brutto. Zero oznacza pełny zwrot pozycji.
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left">Nazwa</th>
                  <th className="w-24 px-3 py-2 text-right">Ilość</th>
                  <th className="w-36 px-3 py-2 text-right">Cena brutto po</th>
                  <th className="w-32 px-3 py-2 text-right">Wartość</th>
                </tr>
              </thead>
              <tbody>
                {wiersze.map((w, i) => {
                  const c = liczba(w.cenaBrutto);
                  const il = Number(w.ilosc);
                  const wart =
                    Number.isFinite(c) && Number.isFinite(il) && c >= 0 && il >= 1
                      ? Math.round(c * il * 100) / 100
                      : null;
                  return (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-3 py-2">
                        <input
                          value={w.nazwa}
                          onChange={(e) => ustaw(i, "nazwa", e.target.value)}
                          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
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
                          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-sm text-white"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                        {wart === null ? "—" : PLN.format(wart)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-4">
            <dl className="ml-auto max-w-sm space-y-1 text-sm">
              <div className="flex justify-between text-neutral-400">
                <dt>Wartość przed korektą</dt>
                <dd className="tabular-nums">
                  {PLN.format(przed)} {faktura.currency}
                </dd>
              </div>
              <div className="flex justify-between text-neutral-400">
                <dt>Wartość po korekcie</dt>
                <dd className="tabular-nums">
                  {PLN.format(po)} {faktura.currency}
                </dd>
              </div>
              <div
                className={`flex justify-between border-t border-white/10 pt-1 font-semibold ${
                  roznica < 0 ? "text-emerald-300" : roznica > 0 ? "text-amber-300" : "text-white"
                }`}
              >
                <dt>{roznica < 0 ? "Do zwrotu klientowi" : roznica > 0 ? "Do dopłaty" : "Różnica"}</dt>
                <dd className="tabular-nums">
                  {PLN.format(Math.abs(roznica))} {faktura.currency}
                </dd>
              </div>
            </dl>
            {roznica < 0 && (
              <p className="mt-3 text-[11px] text-emerald-200/70">
                Ta kwota wróci do portfela klienta automatycznie, w tej samej transakcji co
                dokument. Nie ma drugiego kroku.
              </p>
            )}
            {roznica > 0 && (
              <p className="mt-3 text-[11px] text-amber-200/70">
                Korekta w górę NIE pobiera pieniędzy z portfela — dopłata jest zobowiązaniem
                klienta, nie automatycznym obciążeniem.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["Nazwa nabywcy", nazwaNabywcy, setNazwaNabywcy],
              ["NIP", nipNabywcy, setNipNabywcy],
              ["Adres", adresNabywcy, setAdresNabywcy],
            ] as Array<[string, string, (v: string) => void]>
          ).map(([label, v, set]) => (
            <label key={label} className="block">
              <span className="text-xs uppercase tracking-wide text-neutral-400">{label}</span>
              <input
                value={v}
                onChange={(e) => set(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
          <p className="md:col-span-3 text-[11px] text-neutral-500">
            Kwoty pozostają bez zmian. Korekta formalna wchodzi do rejestru VAT z wartością zero
            i nie rusza portfela.
          </p>
        </section>
      )}

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-400">Przyczyna korekty</span>
        <textarea
          value={przyczyna}
          onChange={(e) => setPrzyczyna(e.target.value)}
          rows={2}
          placeholder="np. Rezygnacja klienta w połowie okresu rozliczeniowego"
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          Pole obowiązkowe NA DOKUMENCIE — art. 106j ust. 2 pkt 4 ustawy o VAT. Trafia na PDF
          i do KSeF-a, nie tylko do dziennika.
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
            const pozycjePo: PozycjaKorektyWej[] = wiersze
              .filter((w) => w.nazwa.trim())
              .map((w) => ({
                nazwa: w.nazwa.trim(),
                ilosc: Number(w.ilosc),
                cenaBrutto: liczba(w.cenaBrutto),
              }));
            startTransition(async () => {
              const res = await wystawKorekte(faktura.id, {
                rodzaj,
                przyczyna: przyczyna.trim(),
                ...(rodzaj === "WARTOSCIOWA"
                  ? { pozycjePo }
                  : {
                      nabywcaPo: {
                        ...nabywca,
                        name: nazwaNabywcy.trim(),
                        nip: nipNabywcy.trim(),
                        address: adresNabywcy.trim(),
                      },
                    }),
              });
              if (res.ok) setWynik({ numer: res.numer, zwrot: res.zwrot });
              else setBlad(res.error);
            });
          }}
          className="rounded-md border border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-100 hover:bg-indigo-500/25 disabled:opacity-40"
        >
          {pending ? "Wystawiam…" : "Wystaw korektę"}
        </button>
        <Link href="/invoices" className="text-sm text-neutral-400 hover:text-white">
          Anuluj
        </Link>
      </div>
    </div>
  );
}

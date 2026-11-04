'use client';

import { useId, useState, useTransition } from 'react';
import { Loader2, Save, Trees } from 'lucide-react';
import { Select } from '@/components/select';
import { Checkbox } from '@/components/checkbox';
import { PoleLiczby } from '@/components/pole-liczby';
import { sprawdzSaldo, uruchomPrzebieg, zapiszUstawieniaDrzew, type PanelDrzew, type UstawieniaDrzew } from './actions';
import { CERTYFIKAT_VERRIS, CZESCI_DRZEWA, kosztRocznyGrosze, procent, punktyZaProcent, wkladCzesci, zl } from './drzewa-wyliczenia';

const POLE = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60';
/** Przykład do podglądu — ceny hostingu brutto z cennika (rok / miesiąc). */
const PRZYKLAD = { rokBrutto: 44_900, miesiacBrutto: 4_500 };

export function UstawieniaDrzewForm({ panel }: { panel: PanelDrzew }) {
  const [u, setU] = useState<UstawieniaDrzew>(panel.ustawienia);
  const [stan, setStan] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const id = useId();
  const ustaw = (z: Partial<UstawieniaDrzew>) => setU((x) => ({ ...x, ...z }));

  const rok = wkladCzesci(PRZYKLAD.rokBrutto, u.wkladNa100ZlNetto);
  const mies = wkladCzesci(PRZYKLAD.miesiacBrutto, u.wkladNa100ZlNetto);
  const sto = (b: number, n: number) =>
    kosztRocznyGrosze({ bruttoGrosze: b, platnosciWRoku: n, klienci: 100, stawka: u.wkladNa100ZlNetto, kosztDrzewaGrosze: u.kosztDrzewaGrosze });
  const k100rok = sto(PRZYKLAD.rokBrutto, 1);
  const k100mies = sto(PRZYKLAD.miesiacBrutto, 12);
  const tokenOk = panel.tokeny[u.srodowisko];

  const akcja = (fn: () => Promise<void>) => start(fn);

  return (
    <section className="max-w-3xl space-y-6 rounded-2xl border border-white/10 bg-black/30 p-6">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <Trees className="h-4 w-4" aria-hidden /> Ustawienia drzew
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-white sm:col-span-2">
          <Checkbox checked={u.wlaczone} onChange={(e) => ustaw({ wlaczone: e.target.checked })} />
          Sadzenie włączone (harmonogram co godzinę)
        </label>
        <div className="space-y-1">
          <label htmlFor={`${id}-sr`} className="text-xs font-medium text-neutral-300">API</label>
          <Select
            id={`${id}-sr`}
            value={u.srodowisko}
            onChange={(v) => ustaw({ srodowisko: v as UstawieniaDrzew['srodowisko'] })}
            options={[
              { value: 'test', label: 'Testowe (RC) — rc.api.posadzimy.pl' },
              { value: 'produkcja', label: 'Produkcja — api.posadzimy.pl' },
            ]}
          />
          <p className={`text-xs ${tokenOk ? 'text-emerald-300' : 'text-amber-300'}`}>
            Token: {tokenOk ? 'ustawiony' : `brak (${panel.envTokenow[u.srodowisko]})`}
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-grp`} className="text-xs font-medium text-neutral-300">ID sadzenia (treeGroupID)</label>
          <input id={`${id}-grp`} className={POLE} value={u.idSadzenia} onChange={(e) => ustaw({ idSadzenia: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-koszt`} className="text-xs font-medium text-neutral-300">Koszt drzewa (zł, maks. 20)</label>
          <PoleLiczby
            id={`${id}-koszt`}
            className={POLE}
            value={u.kosztDrzewaGrosze / 100}
            onChange={(v) => ustaw({ kosztDrzewaGrosze: Math.min(2000, Math.max(1, Math.round(v * 100))) })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-wklad`} className="text-xs font-medium text-neutral-300">Wkład: % drzewa na każde 100 zł netto</label>
          <PoleLiczby
            id={`${id}-wklad`}
            className={POLE}
            value={u.wkladNa100ZlNetto / 100}
            onChange={(v) => ustaw({ wkladNa100ZlNetto: Math.min(2000, Math.max(0, Math.round(v * 100))) })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-pkt`} className="text-xs font-medium text-neutral-300">Punkty EKO za całe drzewo</label>
          <PoleLiczby id={`${id}-pkt`} className={POLE} min={1} value={u.punktyNaDrzewo} onChange={(v) => ustaw({ punktyNaDrzewo: Math.round(v) })} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-kr`} className="text-xs font-medium text-neutral-300">Kredyty API za jedno drzewo</label>
          <PoleLiczby id={`${id}-kr`} className={POLE} min={1} value={u.kredytyNaDrzewo} onChange={(v) => ustaw({ kredytyNaDrzewo: Math.round(v) })} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-maks`} className="text-xs font-medium text-neutral-300">Maks. drzew w jednym zamówieniu z puli</label>
          <PoleLiczby id={`${id}-maks`} className={POLE} min={1} value={u.maksDrzewNaZamowienie} onChange={(v) => ustaw({ maksDrzewNaZamowienie: Math.round(v) })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <p className="text-xs font-medium text-neutral-300">Certyfikat (stały, decyzja z 4.11.2026)</p>
          <p className="text-xs text-neutral-400">
            Nagłówek „{CERTYFIKAT_VERRIS.customerName}”, tekst „{CERTYFIKAT_VERRIS.certificateText}” — także przy własnym
            drzewie klienta. Do partnera sadzenia nie wysyłamy żadnych danych klientów.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300">
        <p className="font-semibold text-white">Podgląd (hosting 449 zł/rok i 45 zł/mies. brutto, bez rabatu na start, zapłacone pieniędzmi)</p>
        <p className="mt-1 text-xs text-neutral-400">
          Wkład liczy się tylko od części opłaty zapłaconej pieniędzmi — kredyty z kodów (np. BETA), promocji, poleceń
          i rekompensat schodzą z portfela najpierw i nie dają wkładu.
        </p>
        <ul className="mt-2 space-y-1">
          <li>Usługa roczna: {procent(rok)} drzewa = {zl(Math.ceil((rok * u.kosztDrzewaGrosze) / CZESCI_DRZEWA))}</li>
          <li>Usługa miesięczna: {procent(mies)} drzewa za miesiąc = {zl(Math.ceil((mies * u.kosztDrzewaGrosze) / CZESCI_DRZEWA))}</li>
          <li>100 klientów rocznych: {procent(k100rok.czesci).replace('%', '')} drzew/rok ≈ {zl(k100rok.grosze)}</li>
          <li>100 klientów miesięcznych: {procent(k100mies.czesci).replace('%', '')} drzew/rok ≈ {zl(k100mies.grosze)}</li>
          <li>
            Wymiana punktów: całe drzewo {u.punktyNaDrzewo} pkt, 1% drzewa {punktyZaProcent(1, u.punktyNaDrzewo)} pkt; przy
            koszcie drzewa {zl(u.kosztDrzewaGrosze)} punkt kosztuje Verris ok. {zl(Math.ceil(u.kosztDrzewaGrosze / Math.max(1, u.punktyNaDrzewo)))}
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            akcja(async () => {
              const r = await zapiszUstawieniaDrzew(u);
              if (r.ok) {
                setU(r.ustawienia);
                setStan({ ok: 'Zapisano.' });
              } else setStan({ error: r.error });
            })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Zapisz
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            akcja(async () => {
              const r = await sprawdzSaldo();
              setStan(r.ok ? { ok: `Saldo kredytów API (${r.srodowisko}): ${r.saldo}` } : { error: r.error });
            })
          }
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-50"
        >
          Sprawdź saldo kredytów
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            akcja(async () => {
              const r = await uruchomPrzebieg();
              if (!r.ok) return setStan({ error: r.error });
              const p = r.raport;
              setStan(
                p.pominiety
                  ? { error: p.pominiety }
                  : { ok: `Wysłane: ${p.wyslane}, posadzone drzewa: ${p.posadzone}${p.bledy.length ? `, błędy: ${p.bledy.join('; ')}` : ''}` },
              );
            })
          }
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-50"
        >
          Uruchom sadzenie teraz
        </button>
      </div>
      {stan.ok ? <p className="text-sm text-emerald-300">{stan.ok}</p> : null}
      {stan.error ? <p className="text-sm text-rose-300">{stan.error}</p> : null}
    </section>
  );
}

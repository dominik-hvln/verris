'use client';

import { useId, useState, useTransition } from 'react';
import { Globe, Loader2, Save } from 'lucide-react';
import { Select, type SelectOption } from '@/components/select';
import { Checkbox } from '@/components/checkbox';
import { PoleLiczby } from '@/components/pole-liczby';
import { zapiszAsystentaWww, type AsystentWww, type KonfiguracjaAsystentaWww, type UstawieniaAi } from './actions';

const usd = (v: number) => `$${v.toFixed(2)}`;
const POLE = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60';

/** Modele Anthropic z ustawień AI; bieżący spoza listy zostaje jako opcja (nie podmieniamy go po cichu na pierwszy z listy). */
function opcjeModeli(znane: UstawieniaAi['znaneModele'], biezacy: string): SelectOption[] {
  const lista = znane.filter((m) => m.dostawca === 'anthropic').map((m) => ({ value: m.model, label: m.nazwa }));
  return lista.some((o) => o.value === biezacy) || !biezacy ? lista : [{ value: biezacy, label: biezacy }, ...lista];
}

/**
 * Admin → Ustawienia → Asystent AI → „Asystent na verris.pl” (1.11; przełącznik od 6.11). Jedyny włącznik widgetu
 * na stronie: www pyta API (GET /public/asystent/status) z cache 60 s — bez flagi przy wdrożeniu.
 */
export function AsystentWwwForm({
  initial,
  znaneModele,
}: {
  initial: { ok: true; dane: AsystentWww } | { ok: false; error: string };
  znaneModele: UstawieniaAi['znaneModele'];
}) {
  const id = useId();
  const [dane, setDane] = useState<AsystentWww | null>(initial.ok ? initial.dane : null);
  const [konf, setKonf] = useState<KonfiguracjaAsystentaWww | null>(initial.ok ? initial.dane.konfiguracja : null);
  const [stan, setStan] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();

  const naglowek = (
    <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
      <Globe className="h-4 w-4" aria-hidden /> Asystent na verris.pl
    </h2>
  );

  if (!initial.ok || !dane || !konf) {
    return (
      <section data-sekcja="asystent-www" className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl">
        {naglowek}
        <p role="alert" className="text-sm text-rose-300">
          {initial.ok ? 'Brak danych asystenta.' : initial.error} Odśwież stronę; reszta ustawień AI działa.
        </p>
      </section>
    );
  }

  const ustaw = (z: Partial<KonfiguracjaAsystentaWww>) => setKonf((k) => (k ? { ...k, ...z } : k));
  const zapisz = () =>
    start(async () => {
      const r = await zapiszAsystentaWww(konf);
      if (r.ok) {
        setDane(r.dane);
        setKonf(r.dane.konfiguracja);
        setStan({ ok: true });
      } else setStan({ error: r.error });
    });

  const limitDniaWyczerpany = konf.limitDziennyUsd > 0 && dane.dzisUsd >= konf.limitDziennyUsd;
  const limitMiesiacaWyczerpany = konf.limitMiesiecznyUsd > 0 && dane.miesiacUsd >= konf.limitMiesiecznyUsd;

  return (
    <section data-sekcja="asystent-www" className="space-y-5 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl">
      {naglowek}

      {!dane.kluczAnthropic ? (
        <p role="alert" data-ostrzezenie="brak-klucza" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Brak klucza ANTHROPIC_API_KEY na serwerze — asystent nie pokaże się na verris.pl, nawet po włączeniu.
        </p>
      ) : null}

      <label className="flex items-start gap-3 text-sm text-white">
        <Checkbox
          id={`${id}-wlaczony`}
          checked={konf.wlaczony}
          onChange={(e) => ustaw({ wlaczony: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          Asystent na verris.pl włączony
          <span className="block text-[11px] text-neutral-400">
            Po zapisie pojawia się (albo znika) na stronie do ok. minuty — bez wdrożenia. Wymaga klucza Anthropic.
          </span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-model`} className="text-xs font-medium text-neutral-300">Model odpowiedzi</label>
          <Select id={`${id}-model`} value={konf.model} options={opcjeModeli(znaneModele, konf.model)} onChange={(v) => ustaw({ model: v })} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-straznik`} className="text-xs font-medium text-neutral-300">Model strażnika (temat, nadużycia)</label>
          <Select
            id={`${id}-straznik`}
            value={konf.modelStraznika}
            options={opcjeModeli(znaneModele, konf.modelStraznika)}
            onChange={(v) => ustaw({ modelStraznika: v })}
          />
        </div>
      </div>
      <p className="text-[11px] text-neutral-400">Tylko modele Anthropic — asystent na verris.pl nie działa na innych dostawcach.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-dzien`} className="block space-y-1">
          <span className="text-xs font-medium text-neutral-300">Limit dzienny (USD, 0 = bez limitu)</span>
          <PoleLiczby
            id={`${id}-dzien`}
            value={konf.limitDziennyUsd}
            onChange={(n) => ustaw({ limitDziennyUsd: Math.min(10_000, n) })}
            className={POLE}
          />
        </label>
        <label htmlFor={`${id}-miesiac`} className="block space-y-1">
          <span className="text-xs font-medium text-neutral-300">Limit miesięczny (USD, 0 = bez limitu)</span>
          <PoleLiczby
            id={`${id}-miesiac`}
            value={konf.limitMiesiecznyUsd}
            onChange={(n) => ustaw({ limitMiesiecznyUsd: Math.min(10_000, n) })}
            className={POLE}
          />
        </label>
      </div>
      <p data-koszt-asystenta className="text-[11px] text-neutral-400">
        Koszt dziś: <strong className="text-white">{usd(dane.dzisUsd)}</strong> · w tym miesiącu:{' '}
        <strong className="text-white">{usd(dane.miesiacUsd)}</strong> (dzień i miesiąc w UTC). Po przekroczeniu limitu asystent
        znika ze strony do końca dnia albo miesiąca.
      </p>
      {limitDniaWyczerpany || limitMiesiacaWyczerpany ? (
        <p className="text-[11px] text-amber-300">
          {limitMiesiacaWyczerpany ? 'Limit miesięczny' : 'Limit dzienny'} wyczerpany — asystent jest teraz ukryty na verris.pl.
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={zapisz}
          disabled={pending || !konf.model || !konf.modelStraznika}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Zapisz asystenta na verris.pl
        </button>
        <span role="status" className="text-xs">
          {stan.ok ? <span className="text-emerald-300">Zapisano — na verris.pl do ok. minuty.</span> : null}
          {stan.error ? <span className="text-rose-300">{stan.error}</span> : null}
        </span>
      </div>
    </section>
  );
}

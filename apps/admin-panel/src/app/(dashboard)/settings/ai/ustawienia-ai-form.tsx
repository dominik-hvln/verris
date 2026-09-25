'use client';

import { useState, useTransition } from 'react';
import { Bot, Loader2, Plus, Save } from 'lucide-react';
import { Select } from '@/components/select';
import { zapiszUstawieniaAi, type DostawcaAi, type KonfiguracjaAi, type UstawieniaAi } from './actions';

type Poziom = 'szybki' | 'analiza';

/** Typowe wywołanie (tokeny) — do szacunków; realne liczby są w tabeli kosztów poniżej. */
const TYPOWE: Record<Poziom, { wej: number; wyj: number; opis: string }> = {
  szybki: { wej: 3000, wyj: 300, opis: 'pytanie w czacie z kontekstem bazy wiedzy ≈ 3 000 tokenów wej. / 300 wyj.' },
  analiza: { wej: 4000, wyj: 1500, opis: 'prognoza lub szkic odpowiedzi ≈ 4 000 tokenów wej. / 1 500 wyj.' },
};
const INNY = '__inny__';
const DOSTAWCY: { value: DostawcaAi; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
];
const usd = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
const POLE = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60';

export function UstawieniaAiForm({ initial }: { initial: UstawieniaAi }) {
  const [konf, setKonf] = useState<KonfiguracjaAi>(initial.konfiguracja);
  const [klucze, setKlucze] = useState(initial.klucze);
  const [nowyModel, setNowyModel] = useState('');
  const [stan, setStan] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  const znane = initial.znaneModele;

  const koszt = (model: string, p: Poziom) => {
    const c = konf.ceny[model];
    return c ? (TYPOWE[p].wej * c.wej + TYPOWE[p].wyj * c.wyj) / 1_000_000 : null;
  };
  const ustawPoziom = (p: Poziom, zmiana: Partial<KonfiguracjaAi['szybki']>) =>
    setKonf((k) => ({ ...k, [p]: { ...k[p], ...zmiana } }));
  const ustawCene = (model: string, pole: 'wej' | 'wyj', v: string) =>
    setKonf((k) => ({ ...k, ceny: { ...k.ceny, [model]: { ...k.ceny[model], [pole]: Math.max(0, Number(v) || 0) } } }));

  const zapisz = () =>
    start(async () => {
      const r = await zapiszUstawieniaAi(konf);
      if (r.ok) {
        setKonf(r.ustawienia.konfiguracja);
        setKlucze(r.ustawienia.klucze);
        setStan({ ok: true });
      } else setStan({ error: r.error });
    });

  const kosztCzatu = koszt(konf.szybki.model, 'szybki');

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <Bot className="h-4 w-4" aria-hidden /> Poziomy i modele
      </h2>

      {(['szybki', 'analiza'] as Poziom[]).map((p) => {
        const { dostawca, model } = konf[p];
        const lista = znane.filter((m) => m.dostawca === dostawca);
        const wlasny = !lista.some((m) => m.model === model);
        const k = koszt(model, p);
        return (
          <fieldset key={p} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <legend className="px-1 text-sm font-semibold text-white">
              {p === 'szybki' ? 'Szybki — czat i podpowiedzi' : 'Analiza — prognozy i szkice obsługi'}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`${p}-dostawca`} className="text-xs font-medium text-neutral-300">Dostawca</label>
                <Select
                  id={`${p}-dostawca`}
                  value={dostawca}
                  options={DOSTAWCY}
                  onChange={(v) => {
                    const d = v as DostawcaAi;
                    ustawPoziom(p, { dostawca: d, model: znane.find((m) => m.dostawca === d)?.model ?? model });
                  }}
                />
                {!klucze[dostawca] ? (
                  <span className="block text-[11px] text-amber-300">
                    Brak klucza {dostawca === 'openai' ? 'AI_API_KEY' : 'ANTHROPIC_API_KEY'} na serwerze — ten poziom będzie wyłączony.
                  </span>
                ) : null}
              </div>
              <div className="space-y-1">
                <label htmlFor={`${p}-model`} className="text-xs font-medium text-neutral-300">Model i wersja</label>
                <Select
                  id={`${p}-model`}
                  value={wlasny ? INNY : model}
                  options={[...lista.map((m) => ({ value: m.model, label: m.nazwa })), { value: INNY, label: 'Inny (wpisz identyfikator)…' }]}
                  onChange={(v) => ustawPoziom(p, { model: v === INNY ? '' : v })}
                />
              </div>
            </div>
            {wlasny ? (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-300">Identyfikator modelu z dokumentacji dostawcy</span>
                <input
                  value={model}
                  onChange={(e) => ustawPoziom(p, { model: e.target.value.trim() })}
                  placeholder={dostawca === 'openai' ? 'np. gpt-5.7' : 'np. claude-sonnet-5-1'}
                  className={POLE}
                />
                {!konf.ceny[model] && model ? (
                  <span className="block text-[11px] text-amber-300">
                    Dodaj cenę tego modelu niżej — bez niej koszt liczony jest zawyżonym szacunkiem ($20/$100).
                  </span>
                ) : null}
              </label>
            ) : null}
            <p className="text-[11px] text-neutral-400">
              Szacunek: {k !== null ? <strong className="text-white">{usd(k)}</strong> : '—'} za wywołanie
              {k !== null ? <> · {usd(k * 1000)} za 1000 wywołań</> : null} ({TYPOWE[p].opis}).
            </p>
          </fieldset>
        );
      })}

      <div className="space-y-2">
        <label className="block space-y-1 max-w-xs">
          <span className="text-xs font-medium text-neutral-300">Limit na konto klienta (USD / miesiąc, 0 = bez limitu)</span>
          <input
            type="number"
            min={0}
            max={1000}
            step={0.5}
            value={konf.limitKlientaUsd}
            onChange={(e) => setKonf((k) => ({ ...k, limitKlientaUsd: Math.max(0, Number(e.target.value) || 0) }))}
            className={POLE}
          />
        </label>
        <p className="text-[11px] text-neutral-400">
          Liczą się czat klienta i prognozy zasobów. Praca obsługi nie ma limitu i nie zjada limitu klienta.
          {kosztCzatu && konf.limitKlientaUsd > 0 ? (
            <> Przy obecnym modelu to ok. <strong className="text-white">{Math.floor(konf.limitKlientaUsd / kosztCzatu).toLocaleString('pl-PL')}</strong> pytań w czacie miesięcznie.</>
          ) : null}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">Ceny modeli (USD za 1 mln tokenów)</h3>
        <p className="text-[11px] text-neutral-400">Domyślnie z oficjalnych cenników dostawców. Popraw, gdy dostawca zmieni cennik.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-400">
              <th className="py-1 font-medium">Model</th>
              <th className="py-1 font-medium">Wejście</th>
              <th className="py-1 font-medium">Wyjście</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(konf.ceny).map(([m, c]) => (
              <tr key={m} className="border-t border-white/5">
                <td className="py-1.5 pr-3 font-mono text-xs text-white">{m}</td>
                {(['wej', 'wyj'] as const).map((pole) => (
                  <td key={pole} className="py-1.5 pr-3">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={c[pole]}
                      aria-label={`${m} — cena ${pole === 'wej' ? 'wejścia' : 'wyjścia'}`}
                      onChange={(e) => ustawCene(m, pole, e.target.value)}
                      className={`${POLE} max-w-[120px]`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2 max-w-md">
          <input
            value={nowyModel}
            onChange={(e) => setNowyModel(e.target.value.trim())}
            placeholder="identyfikator nowego modelu"
            aria-label="Identyfikator nowego modelu"
            className={POLE}
          />
          <button
            type="button"
            disabled={!/^[A-Za-z0-9._:-]{2,80}$/.test(nowyModel) || Boolean(konf.ceny[nowyModel])}
            onClick={() => {
              setKonf((k) => ({ ...k, ceny: { ...k.ceny, [nowyModel]: { wej: 0, wyj: 0 } } }));
              setNowyModel('');
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden /> Dodaj
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={zapisz}
          disabled={pending || !konf.szybki.model || !konf.analiza.model}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Zapisz ustawienia AI
        </button>
        <span role="status" className="text-xs">
          {stan.ok ? <span className="text-emerald-300">Zapisano — działa od razu.</span> : null}
          {stan.error ? <span className="text-rose-300">{stan.error}</span> : null}
        </span>
      </div>
    </section>
  );
}

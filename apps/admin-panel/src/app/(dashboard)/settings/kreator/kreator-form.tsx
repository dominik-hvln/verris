'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Bot, Image as Zdjecie, Loader2, Plus, Save, Sparkles, Trash2, Users } from 'lucide-react';
import { Select, type SelectOption } from '@/components/select';
import { Checkbox } from '@/components/checkbox';
import { potwierdz } from '@/components/potwierdz';
import { plForm } from '@/lib/pl';
import {
  dodajKontoTestowe,
  usunKontoTestowe,
  zapiszKreator,
  type BibliotekaZdjec,
  type DostawcaObrazowAi,
  type KonfiguracjaKreatora,
  type KonfiguracjaObrazowAi,
  type UstawieniaKreatora,
} from './actions';

const POLE = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60';
const SEKCJA = 'space-y-5 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl';
const NAGLOWEK = 'flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400';
const usd = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
const mnoznik = (v: number) => `×${v.toLocaleString('pl-PL')}`;
const tokeny = (v: number) => `${v.toLocaleString('pl-PL')} ${plForm(v, 'token', 'tokeny', 'tokenów')}`;
/** Prosta kontrola formatu przed wywołaniem API; istnienie konta sprawdza API (POST /admin/kreator/konta-testowe). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KLUCZE: Record<BibliotekaZdjec, string> = { pixabay: 'PIXABAY_API_KEY', openverse: '', pexels: 'PEXELS_API_KEY' };

/** Modele Anthropic z API; bieżący spoza listy zostaje jako opcja (nie podmieniamy go po cichu). */
function opcjeModeli(modele: UstawieniaKreatora['modele'], biezacy: string): SelectOption[] {
  const lista = modele.map((m) => ({ value: m.model, label: m.nazwa }));
  return lista.some((o) => o.value === biezacy) ? lista : [{ value: biezacy, label: `${biezacy} (spoza listy)` }, ...lista];
}

/** Kolejność wyświetlania: włączone w kolejności z konfiguracji, potem pozostałe. */
function kolejnoscBibliotek(konf: KonfiguracjaKreatora, biblioteki: UstawieniaKreatora['biblioteki']): BibliotekaZdjec[] {
  return [...konf.bibliotekiZdjec, ...biblioteki.map((b) => b.id).filter((id) => !konf.bibliotekiZdjec.includes(id))];
}

/**
 * Admin → Wiedza i AI → Kreator stron (/settings/kreator, paczka 123): dostęp (włącznik dla wszystkich i konta
 * testowe), modele AI i biblioteki zdjęć. Konta testowe zapisują się od razu (API sprawdza, czy konto istnieje);
 * włącznik, modele i biblioteki – przyciskiem „Zapisz”.
 */
export function KreatorForm({ initial, magazyn }: { initial: UstawieniaKreatora; magazyn: { zdjecia: number; bajty: number } | null }) {
  const id = useId();
  const [dane, setDane] = useState(initial);
  const [konf, setKonf] = useState<KonfiguracjaKreatora>(initial.konfiguracja);
  const [kolejnosc, setKolejnosc] = useState<BibliotekaZdjec[]>(() => kolejnoscBibliotek(initial.konfiguracja, initial.biblioteki));
  const [email, setEmail] = useState('');
  const [stanKont, setStanKont] = useState<{ ok?: string; error?: string }>({});
  const [stan, setStan] = useState<{ ok?: boolean; error?: string }>({});
  const [zapis, startZapis] = useTransition();
  const [konta, startKonta] = useTransition();

  const ustaw = (z: Partial<KonfiguracjaKreatora>) => setKonf((k) => ({ ...k, ...z }));
  const przyjmij = (d: UstawieniaKreatora) => {
    setDane(d);
    setKonf(d.konfiguracja);
    setKolejnosc(kolejnoscBibliotek(d.konfiguracja, d.biblioteki));
  };
  const wlaczone = new Set(konf.bibliotekiZdjec);
  const ustawBiblioteki = (lista: BibliotekaZdjec[], wl: Set<BibliotekaZdjec>) => {
    setKolejnosc(lista);
    ustaw({ bibliotekiZdjec: lista.filter((b) => wl.has(b)) });
  };
  const przesun = (i: number, o: -1 | 1) => {
    const l = [...kolejnosc];
    [l[i], l[i + o]] = [l[i + o]!, l[i]!];
    ustawBiblioteki(l, wlaczone);
  };
  const przelacz = (b: BibliotekaZdjec, on: boolean) => {
    const wl = new Set(wlaczone);
    if (on) wl.add(b);
    else wl.delete(b);
    ustawBiblioteki(kolejnosc, wl);
  };

  const wlaczDlaWszystkich = async (on: boolean) => {
    if (on && !dane.regulamin.wymieniaKreator) {
      const ok = await potwierdz(
        'Obowiązujący Regulamin nie wymienia jeszcze Verris Kreatora ani Kreatora Pro. Włączyć kreator dla wszystkich klientów mimo to? Zmiana zadziała po zapisie.',
        { akcja: 'Włącz dla wszystkich', tytul: 'Kreator dla wszystkich klientów' },
      );
      if (!ok) return;
    }
    ustaw({ wlaczony: on });
  };

  const zapisz = () =>
    startZapis(async () => {
      const r = await zapiszKreator(konf);
      if (r.ok) {
        przyjmij(r.dane);
        setStan({ ok: true });
      } else setStan({ error: r.error });
    });

  const dodaj = () => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setStanKont({ error: 'Podaj poprawny adres e-mail konta klienta.' });
      return;
    }
    startKonta(async () => {
      const r = await dodajKontoTestowe(e);
      if (r.ok) {
        // Lista z API; reszta formularza (niezapisane zmiany) zostaje.
        setDane(r.dane);
        setEmail('');
        setStanKont({ ok: `Dodano ${e.toLowerCase()} – kreator jest dla tego konta dostępny od razu.` });
      } else setStanKont({ error: r.error });
    });
  };
  const usun = (wpis: string) =>
    startKonta(async () => {
      const r = await usunKontoTestowe(wpis);
      if (r.ok) {
        setDane(r.dane);
        setStanKont({ ok: `Usunięto ${wpis} z kont testowych.` });
      } else setStanKont({ error: r.error });
    });

  const model = (m: string) => dane.modele.find((x) => x.model === m);
  const mg = model(konf.modelGeneracji);
  const mz = model(konf.modelZmian);
  const zmieniono =
    konf.wlaczony !== dane.konfiguracja.wlaczony ||
    konf.modelGeneracji !== dane.konfiguracja.modelGeneracji ||
    konf.modelZmian !== dane.konfiguracja.modelZmian ||
    konf.bibliotekiZdjec.join() !== dane.konfiguracja.bibliotekiZdjec.join() ||
    JSON.stringify(konf.obrazyAi) !== JSON.stringify(dane.konfiguracja.obrazyAi);
  const ustawObrazy = (z: Partial<KonfiguracjaObrazowAi>) => ustaw({ obrazyAi: { ...konf.obrazyAi, ...z } });
  const dostawcaAi = dane.dostawcyObrazowAi.find((d) => d.id === konf.obrazyAi.dostawca);
  const wlaczObrazy = async (on: boolean) => {
    if (on) {
      const ok = await potwierdz(
        'Dostawca obrazów to nowy podprocesor. Włącz generowanie zdjęć dopiero po publikacji zmiany Polityki prywatności (projekt: docs/legal/drafts/DO_ZATWIERDZENIA_zdjecia-ai.md). Włączyć mimo to? Zmiana zadziała po zapisie.',
        { akcja: 'Włącz generowanie zdjęć', tytul: 'Generowanie zdjęć AI' },
      );
      if (!ok) return;
    }
    ustawObrazy({ wlaczone: on });
  };

  return (
    <div className="space-y-8">
      <section data-sekcja="dostep" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Users className="h-4 w-4" aria-hidden /> Dostęp
        </h2>
        {!dane.regulamin.wymieniaKreator ? (
          <div role="alert" data-ostrzezenie="regulamin" className="flex gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0">
              <strong>Dokumenty prawne.</strong> Obowiązujący Regulamin{dane.regulamin.wersja ? ` (${dane.regulamin.wersja})` : ''} nie wymienia
              jeszcze Verris Kreatora ani Kreatora Pro – projekt zmian czeka na zatwierdzenie w{' '}
              <code className="font-mono break-all">docs/legal/drafts/DO_ZATWIERDZENIA_kreator-pro.md</code>. Kreator dla wszystkich włącz dopiero po
              publikacji nowej wersji Regulaminu w{' '}
              <Link href="/compliance" className="underline hover:text-white">
                RODO → Dokumenty
              </Link>
              ; do tego czasu – tylko konta testowe.
            </p>
          </div>
        ) : null}
        {!dane.kluczAnthropic ? (
          <p role="alert" data-ostrzezenie="brak-klucza" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Brak klucza ANTHROPIC_API_KEY na serwerze – generowanie stron i zmiany AI nie zadziałają, nawet po włączeniu.
          </p>
        ) : null}

        <label className="flex items-start gap-3 text-sm text-white">
          <Checkbox id={`${id}-wlaczony`} checked={konf.wlaczony} onChange={(e) => void wlaczDlaWszystkich(e.target.checked)} className="mt-0.5" />
          <span>
            Kreator włączony dla wszystkich klientów
            <span className="block text-[11px] text-neutral-400">
              Wyłączony: kreator widzą tylko konta testowe z listy poniżej. Włączony: każde konto z hostingiem Verris (także w okresie
              próbnym). Działa od zapisu, bez wdrożenia.
            </span>
          </span>
        </label>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">Konta testowe</h3>
          <p className="text-[11px] text-neutral-400">
            Mają kreator także przy wyłączonym przełączniku. Dodajesz po adresie e-mail istniejącego konta; zmiana zapisuje się od razu.
          </p>
          {dane.konta.length === 0 ? (
            <p className="text-sm text-neutral-400">Brak kont testowych.</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10" aria-label="Konta testowe">
              {dane.konta.map((k) => (
                <li key={k.wpis} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 [overflow-wrap:anywhere] text-white">{k.email ?? k.wpis}</span>
                    {k.istnieje ? null : (
                      <span className="shrink-0 rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-200">brak takiego konta</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => usun(k.wpis)}
                    disabled={konta}
                    aria-label={`Usuń ${k.email ?? k.wpis} z kont testowych`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-200 hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Usuń
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              dodaj();
            }}
            noValidate
          >
            <label htmlFor={`${id}-email`} className="block min-w-[16rem] flex-1 space-y-1">
              <span className="text-xs font-medium text-neutral-300">Adres e-mail konta</span>
              <input
                id={`${id}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="klient@przyklad.pl"
                maxLength={120}
                autoComplete="off"
                className={POLE}
              />
            </label>
            <button
              type="submit"
              disabled={konta || !email.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60"
            >
              {konta ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              Dodaj konto testowe
            </button>
          </form>
          <p role="status" className="text-xs">
            {stanKont.ok ? <span className="text-emerald-300">{stanKont.ok}</span> : null}
            {stanKont.error ? <span className="text-rose-300">{stanKont.error}</span> : null}
          </p>
        </div>
      </section>

      <section data-sekcja="ai" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Bot className="h-4 w-4" aria-hidden /> Modele AI
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${id}-generacja`} className="text-xs font-medium text-neutral-300">
              Model generacji strony
            </label>
            <Select id={`${id}-generacja`} value={konf.modelGeneracji} options={opcjeModeli(dane.modele, konf.modelGeneracji)} onChange={(v) => ustaw({ modelGeneracji: v })} />
            {mg ? (
              <p className="text-[11px] text-neutral-400">
                {usd(mg.cenaWej)} / {usd(mg.cenaWyj)} za 1 mln tokenów wej./wyj. · odczyt cache {mnoznik(mg.mnoznikOdczytuCache)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-zmiany`} className="text-xs font-medium text-neutral-300">
              Model zmian AI (polecenia w edytorze)
            </label>
            <Select id={`${id}-zmiany`} value={konf.modelZmian} options={opcjeModeli(dane.modele, konf.modelZmian)} onChange={(v) => ustaw({ modelZmian: v })} />
            {mz ? (
              <p className="text-[11px] text-neutral-400">
                {usd(mz.cenaWej)} / {usd(mz.cenaWyj)} za 1 mln tokenów wej./wyj. · odczyt cache {mnoznik(mz.mnoznikOdczytuCache)}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-[11px] text-neutral-400">
          Tylko modele Anthropic – kreator korzysta z cache promptu w formacie Anthropic. Ceny i nowe modele zmieniasz w{' '}
          <Link href="/settings/ai" className="underline hover:text-white">
            Konfiguracji asystenta
          </Link>
          .
        </p>
        <div data-cache className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-neutral-300 space-y-1.5">
          <p>
            <strong className="text-white">Cache promptu.</strong> Instrukcje kreatora i opis wersji są w cache na 1 h (zapis{' '}
            {mnoznik(dane.mnoznikiZapisuCache['1h'])} ceny wejścia), strona przy zmianach AI – na 5 min (zapis{' '}
            {mnoznik(dane.mnoznikiZapisuCache['5m'])}). Kolejne wywołania w tym czasie czytają cache za ułamek ceny wejścia (mnożnik
            odczytu przy modelu).
          </p>
          <p>
            W tym miesiącu ({dane.miesiac.miesiac}, UTC): {dane.miesiac.generacje.toLocaleString('pl-PL')}{' '}
            {plForm(dane.miesiac.generacje, 'generacja', 'generacje', 'generacji')}, {dane.miesiac.zmiany.toLocaleString('pl-PL')}{' '}
            {plForm(dane.miesiac.zmiany, 'zmiana AI', 'zmiany AI', 'zmian AI')}, koszt <strong className="text-white">{usd(dane.miesiac.kosztUsd)}</strong>{' '}
            (cache: zapis {tokeny(dane.miesiac.cacheZapis)}, odczyt {tokeny(dane.miesiac.cacheOdczyt)}). Rozbicie kosztu – niżej.
          </p>
        </div>
      </section>

      <section data-sekcja="zdjecia" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Zdjecie className="h-4 w-4" aria-hidden /> Biblioteki zdjęć
        </h2>
        <p className="text-[11px] text-neutral-400">
          Kolejność = kolejność zakładek w edytorze klienta. Biblioteka bez klucza API na serwerze nie pokaże się klientom, nawet włączona.
        </p>
        <ol className="divide-y divide-white/5 rounded-xl border border-white/10" aria-label="Biblioteki zdjęć">
          {kolejnosc.map((b, i) => {
            const info = dane.biblioteki.find((x) => x.id === b);
            if (!info) return null;
            const on = wlaczone.has(b);
            return (
              <li key={b} data-biblioteka={b} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="flex items-center gap-3 text-white">
                    <Checkbox checked={on} onChange={(e) => przelacz(b, e.target.checked)} />
                    <span>{info.nazwa}</span>
                  </label>
                  {!info.wymagaKlucza ? (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[11px] text-emerald-200">bez klucza</span>
                  ) : info.gotowa ? (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[11px] text-emerald-200">klucz skonfigurowany</span>
                  ) : (
                    <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-200">brak klucza {KLUCZE[b]}</span>
                  )}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => przesun(i, -1)}
                    disabled={i === 0}
                    aria-label={`${info.nazwa} wyżej`}
                    className="rounded-md border border-white/10 p-1 text-neutral-300 hover:text-white disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => przesun(i, 1)}
                    disabled={i === kolejnosc.length - 1}
                    aria-label={`${info.nazwa} niżej`}
                    className="rounded-md border border-white/10 p-1 text-neutral-300 hover:text-white disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
        {konf.bibliotekiZdjec.length === 0 ? (
          <p className="text-[11px] text-amber-300">Wszystkie biblioteki wyłączone – klienci będą mogli tylko wgrywać własne zdjęcia.</p>
        ) : null}
        {magazyn ? (
          <p data-magazyn className="text-[11px] text-neutral-400">
            Magazyn zdjęć Verris: {magazyn.zdjecia.toLocaleString('pl-PL')} {plForm(magazyn.zdjecia, 'zdjęcie', 'zdjęcia', 'zdjęć')} w bibliotekach kont,{' '}
            {(magazyn.bajty / 1048576).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB (oryginały z wariantami).
          </p>
        ) : null}
      </section>

      <section data-sekcja="zdjecia-ai" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Sparkles className="h-4 w-4" aria-hidden /> Generowanie zdjęć AI
        </h2>
        <p className="text-[11px] text-neutral-400">
          Zakładka „Wygeneruj” w wyborze zdjęcia. Opis klienta tłumaczy na prompt model zmian AI (wyżej), obraz tworzy dostawca poniżej.
          Bez klucza albo wyłączone – klient widzi „Generowanie zdjęć wkrótce”. Limity miesięczne: próba 3, hosting 20, Pro 100.
        </p>
        <label className="flex items-start gap-3 text-sm text-white">
          <Checkbox id={`${id}-obrazy`} checked={konf.obrazyAi.wlaczone} onChange={(e) => void wlaczObrazy(e.target.checked)} className="mt-0.5" />
          <span>
            Generowanie zdjęć włączone
            <span className="block text-[11px] text-neutral-400">Dla wszystkich kont z dostępem do kreatora (także testowych). Działa od zapisu.</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-dostawca-ai`} className="text-xs font-medium text-neutral-300">
              Dostawca
            </label>
            <Select
              id={`${id}-dostawca-ai`}
              value={konf.obrazyAi.dostawca}
              options={dane.dostawcyObrazowAi.map((d) => ({ value: d.id, label: d.nazwa }))}
              onChange={(v) => {
                const d = dane.dostawcyObrazowAi.find((x) => x.id === v);
                ustawObrazy({ dostawca: v as DostawcaObrazowAi, ...(d ? { model: d.modelDomyslny } : {}) });
              }}
            />
          </div>
          <label htmlFor={`${id}-model-ai`} className="block space-y-1">
            <span className="text-xs font-medium text-neutral-300">Model</span>
            <input
              id={`${id}-model-ai`}
              value={konf.obrazyAi.model}
              onChange={(e) => ustawObrazy({ model: e.target.value.trim().toLowerCase() })}
              maxLength={60}
              autoComplete="off"
              className={POLE}
            />
          </label>
          <label htmlFor={`${id}-cena-ai`} className="block space-y-1">
            <span className="text-xs font-medium text-neutral-300">Cena za obraz (USD)</span>
            <input
              id={`${id}-cena-ai`}
              type="number"
              min={0}
              max={5}
              step={0.001}
              value={konf.obrazyAi.cenaZaObrazUsd}
              onChange={(e) => ustawObrazy({ cenaZaObrazUsd: Number(e.target.value) })}
              className={POLE}
            />
          </label>
        </div>
        <p className="text-[11px] text-neutral-400">
          Cenę za obraz ustaw wg cennika dostawcy – liczy z niej koszt w podsumowaniu i budżet AI platformy
          {dostawcaAi ? ` (domyślnie ${usd(dostawcaAi.cenaDomyslnaUsd)} dla ${dostawcaAi.modelDomyslny} – do sprawdzenia z cennikiem)` : ''}.
        </p>
        <ul className="divide-y divide-white/5 rounded-xl border border-white/10" aria-label="Klucze dostawców zdjęć AI">
          {dane.dostawcyObrazowAi.map((d) => (
            <li key={d.id} data-dostawca-ai={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm text-white">
              <span>{d.nazwa}</span>
              {d.klucz ? (
                <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[11px] text-emerald-200">klucz: tak</span>
              ) : (
                <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-200">klucz: nie ({d.zmienna})</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-neutral-400">
          W tym miesiącu: {dane.miesiac.obrazyAi.toLocaleString('pl-PL')} {plForm(dane.miesiac.obrazyAi, 'zdjęcie AI', 'zdjęcia AI', 'zdjęć AI')} w limitach kont. Koszt – w podsumowaniu niżej.
        </p>
      </section>

      <div className="flex max-w-3xl flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={zapisz}
          disabled={zapis || !konf.modelGeneracji || !konf.modelZmian}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {zapis ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Zapisz ustawienia kreatora
        </button>
        <span role="status" className="text-xs">
          {stan.ok && !zmieniono ? <span className="text-emerald-300">Zapisano – działa od razu.</span> : null}
          {stan.error ? <span className="text-rose-300">{stan.error}</span> : null}
          {zmieniono && !stan.error ? <span className="text-amber-200">Niezapisane zmiany (dostęp, modele, biblioteki albo zdjęcia AI).</span> : null}
        </span>
      </div>
    </div>
  );
}

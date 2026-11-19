'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { AlertTriangle, BarChart3, Bot, Gauge, Loader2, Plus, Save, Tag, Trash2, Users } from 'lucide-react';
import { Select, type SelectOption } from '@/components/select';
import { Checkbox } from '@/components/checkbox';
import { potwierdz } from '@/components/potwierdz';
import { formatPln } from '@/lib/credits';
import { plForm } from '@/lib/pl';
import {
  dodajKontoTestoweMarki,
  usunKontoTestoweMarki,
  zapiszMarke,
  type DostepnoscMarki,
  type UstawieniaMarki,
  type ZmianyMarki,
} from './actions';
import { bladPola, nettoZBrutto, ZAKRESY, type PoleLiczbowe } from './ceny';

const POLE = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60';
const SEKCJA = 'space-y-5 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl';
const NAGLOWEK = 'flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const usd = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;

export const OPCJE_DOSTEPNOSCI: SelectOption[] = [
  { value: 'lista', label: 'Tylko konta z listy' },
  { value: 'beta', label: 'Konta z listy i testerzy (beta)' },
  { value: 'wszyscy', label: 'Wszyscy klienci z hostingiem' },
];

/** „149,00 zł brutto · 121,14 zł netto” – zawsze obie kwoty. */
export const bruttoINetto = (brutto: number, netto: number) => `${formatPln(brutto)} brutto · ${formatPln(netto)} netto`;

function opcjeModeli(modele: UstawieniaMarki['modele'], biezacy: string): SelectOption[] {
  const lista = modele.map((m) => ({ value: m.model, label: m.nazwa }));
  return lista.some((o) => o.value === biezacy) ? lista : [{ value: biezacy, label: `${biezacy} (spoza listy)` }, ...lista];
}

const zmianyZ = (d: UstawieniaMarki): ZmianyMarki => {
  const { kontaTestowe: _pomin, ...reszta } = d.konfiguracja;
  void _pomin;
  return reszta;
};

/** Pole liczbowe z etykietą, zakresem i błędem przy polu. */
function Liczba(p: { id: string; etykieta: string; pole: PoleLiczbowe; wartosc: number; onChange: (v: number) => void; krok?: number; dopisek?: string }) {
  const blad = bladPola(p.pole, p.wartosc);
  const [min, max] = ZAKRESY[p.pole];
  return (
    <label htmlFor={p.id} className="block space-y-1">
      <span className="text-xs font-medium text-neutral-300">{p.etykieta}</span>
      <input
        id={p.id}
        type="number"
        min={min}
        max={max}
        step={p.krok ?? 1}
        value={Number.isFinite(p.wartosc) ? p.wartosc : ''}
        onChange={(e) => p.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
        aria-invalid={blad ? true : undefined}
        className={POLE}
      />
      {blad ? <span className="block text-[11px] text-rose-300">{blad}</span> : p.dopisek ? <span className="block text-[11px] text-neutral-400">{p.dopisek}</span> : null}
    </label>
  );
}

/**
 * Admin → Wiedza i AI → Kreator marki (/settings/kreator-marki, paczka 130). Wzorzec ekranu Kreatora stron:
 * dostęp (włącznik, dostępność, konta testowe – zapis od razu), limity w cenie hostingu, ceny (zawsze brutto
 * i netto), AI i pliki, użycie miesiąca. Włącznik, limity, ceny i AI – przyciskiem „Zapisz”.
 */
export function KreatorMarkiForm({ initial }: { initial: UstawieniaMarki }) {
  const id = useId();
  const [dane, setDane] = useState(initial);
  const [konf, setKonf] = useState<ZmianyMarki>(() => zmianyZ(initial));
  const [email, setEmail] = useState('');
  const [stanKont, setStanKont] = useState<{ ok?: string; error?: string }>({});
  const [stan, setStan] = useState<{ ok?: boolean; error?: string }>({});
  const [zapis, startZapis] = useTransition();
  const [konta, startKonta] = useTransition();

  const ustaw = (z: Partial<ZmianyMarki>) => setKonf((k) => ({ ...k, ...z }));
  const ustawLimity = (z: Partial<ZmianyMarki['wCenieHostingu']>) => setKonf((k) => ({ ...k, wCenieHostingu: { ...k.wCenieHostingu, ...z } }));
  const ustawPakiet = (z: Partial<ZmianyMarki['pakiet']>) => setKonf((k) => ({ ...k, pakiet: { ...k.pakiet, ...z } }));
  const przyjmij = (d: UstawieniaMarki) => {
    setDane(d);
    setKonf(zmianyZ(d));
  };

  const { regulamin, polityka } = dane.dokumenty;
  const brakujace = [
    regulamin.wymieniaKreatorMarki ? null : `Regulamin${regulamin.wersja ? ` (${regulamin.wersja})` : ''}`,
    polityka.wymieniaKreatorMarki ? null : `Polityka prywatności${polityka.wersja ? ` (${polityka.wersja})` : ''}`,
  ].filter((x): x is string => x !== null);
  const dokumentyGotowe = brakujace.length === 0;
  const bledy = [
    bladPola('marek', konf.wCenieHostingu.marek),
    bladPola('seriiMies', konf.wCenieHostingu.seriiMies),
    bladPola('zmianAiMies', konf.wCenieHostingu.zmianAiMies),
    bladPola('cenaBrutto', konf.pakiet.cenaBrutto),
    bladPola('serie', konf.pakiet.serie),
    bladPola('zmianyAi', konf.pakiet.zmianyAi),
    bladPola('aktualizacjeSzablonowMies', konf.pakiet.aktualizacjeSzablonowMies),
    bladPola('cenaBrutto', konf.drugaMarka.cenaBrutto),
    bladPola('maksRozmiarWgraniaMb', konf.maksRozmiarWgraniaMb),
  ].filter(Boolean);
  const zmieniono = JSON.stringify(konf) !== JSON.stringify(zmianyZ(dane));

  /** Ostrzeżenie przed udostępnieniem poza listą kont, gdy dokumenty prawne jeszcze nie opisują modułu. */
  const ostrzezPrzedUdostepnieniem = async (wlaczony: boolean, dostepnosc: DostepnoscMarki): Promise<boolean> => {
    if (!wlaczony || dostepnosc === 'lista' || dokumentyGotowe) return true;
    return potwierdz(
      'Obowiązujący Regulamin albo Polityka prywatności nie wymieniają jeszcze Kreatora marki (projekt: docs/legal/drafts/DO_ZATWIERDZENIA_kreator-marki.md). Udostępnić moduł poza kontami z listy mimo to? Zmiana zadziała po zapisie.',
      { akcja: 'Udostępnij', tytul: 'Kreator marki dla klientów' },
    );
  };

  const zapisz = () => {
    if (bledy.length) {
      setStan({ error: 'Popraw pola zaznaczone na czerwono.' });
      return;
    }
    startZapis(async () => {
      const r = await zapiszMarke(konf);
      if (r.ok) {
        przyjmij(r.dane);
        setStan({ ok: true });
      } else setStan({ error: r.error });
    });
  };

  const dodaj = () => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setStanKont({ error: 'Podaj poprawny adres e-mail konta klienta.' });
      return;
    }
    startKonta(async () => {
      const r = await dodajKontoTestoweMarki(e);
      if (r.ok) {
        setDane(r.dane);
        setEmail('');
        setStanKont({ ok: `Dodano ${e.toLowerCase()} – Kreator marki jest dla tego konta dostępny od razu.` });
      } else setStanKont({ error: r.error });
    });
  };
  const usun = (wpis: string) =>
    startKonta(async () => {
      const r = await usunKontoTestoweMarki(wpis);
      if (r.ok) {
        setDane(r.dane);
        setStanKont({ ok: `Usunięto ${wpis} z kont testowych.` });
      } else setStanKont({ error: r.error });
    });

  const mg = dane.modele.find((m) => m.model === konf.modelGeneracji);
  const mz = dane.modele.find((m) => m.model === konf.modelZmian);
  const u = dane.uzycie;
  const nPakiet = nettoZBrutto(konf.pakiet.cenaBrutto);
  const nDruga = nettoZBrutto(konf.drugaMarka.cenaBrutto);

  return (
    <div className="space-y-8">
      <section data-sekcja="dostep" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Users className="h-4 w-4" aria-hidden /> Dostęp
        </h2>
        {!dokumentyGotowe ? (
          <div role="alert" data-ostrzezenie="dokumenty" className="flex gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0">
              <strong>Dokumenty prawne.</strong>{' '}
              {brakujace.join(' i ')} {brakujace.length > 1 ? 'nie opisują' : 'nie opisuje'} jeszcze Kreatora marki ani Pakietu marki – projekt czeka na zatwierdzenie (także przez prawnika) w{' '}
              <code className="font-mono break-all">docs/legal/drafts/DO_ZATWIERDZENIA_kreator-marki.md</code>. Moduł poza kontami z listy
              udostępnij dopiero po publikacji nowych wersji w{' '}
              <Link href="/compliance" className="underline hover:text-white">
                RODO → Dokumenty
              </Link>
              .
            </p>
          </div>
        ) : null}
        {!dane.kluczAnthropic ? (
          <p role="alert" data-ostrzezenie="brak-klucza" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Brak klucza ANTHROPIC_API_KEY na serwerze – serie propozycji i zmiany AI nie zadziałają, nawet po włączeniu.
          </p>
        ) : null}

        <label className="flex items-start gap-3 text-sm text-white">
          <Checkbox
            id={`${id}-wlaczony`}
            checked={konf.wlaczony}
            onChange={async (e) => {
              const on = e.target.checked;
              if (await ostrzezPrzedUdostepnieniem(on, konf.dostepnosc)) ustaw({ wlaczony: on });
            }}
            className="mt-0.5"
          />
          <span>
            Kreator marki włączony
            <span className="block text-[11px] text-neutral-400">
              Wyłączony: moduł mają tylko konta z listy poniżej, a strony /kreator-marki na verris.pl nie ma (404). Włączony: dostęp według
              ustawienia „Kto ma dostęp”. Działa od zapisu, bez wdrożenia.
            </span>
          </span>
        </label>

        <div className="space-y-1 max-w-sm">
          <label htmlFor={`${id}-dostepnosc`} className="text-xs font-medium text-neutral-300">
            Kto ma dostęp po włączeniu
          </label>
          <Select
            id={`${id}-dostepnosc`}
            value={konf.dostepnosc}
            options={OPCJE_DOSTEPNOSCI}
            onChange={async (v) => {
              const d = v as DostepnoscMarki;
              if (await ostrzezPrzedUdostepnieniem(konf.wlaczony, d)) ustaw({ dostepnosc: d });
            }}
          />
          <p className="text-[11px] text-neutral-400">
            Strona na verris.pl, ceny w ofercie i artykuły pomocy – tylko przy „Wszyscy klienci”. Testerzy (beta) to konta, które
            zrealizowały kod z zaproszenia do testów.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">Konta testowe</h3>
          <p className="text-[11px] text-neutral-400">Mają Kreator marki zawsze, także przy wyłączonym module. Dodajesz po adresie e-mail istniejącego konta; zmiana zapisuje się od razu.</p>
          {dane.konta.length === 0 ? (
            <p className="text-sm text-neutral-400">Brak kont testowych.</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10" aria-label="Konta testowe Kreatora marki">
              {dane.konta.map((k) => (
                <li key={k.wpis} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 [overflow-wrap:anywhere] text-white">{k.email ?? k.wpis}</span>
                    {k.istnieje ? null : <span className="shrink-0 rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-200">brak takiego konta</span>}
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

      <section data-sekcja="limity" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Gauge className="h-4 w-4" aria-hidden /> W cenie hostingu
        </h2>
        <p className="text-[11px] text-neutral-400">
          Limity dla każdego konta z hostingiem. Serie i zmiany AI odnawiają się co miesiąc; zmiana koloru, kroju i układu działa bez AI i nie
          zużywa limitu.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Liczba id={`${id}-marek`} etykieta="Marki na koncie" pole="marek" wartosc={konf.wCenieHostingu.marek} onChange={(v) => ustawLimity({ marek: v })} />
          <Liczba id={`${id}-serii`} etykieta="Serie propozycji / mies." pole="seriiMies" wartosc={konf.wCenieHostingu.seriiMies} onChange={(v) => ustawLimity({ seriiMies: v })} />
          <Liczba id={`${id}-zmian`} etykieta="Zmiany AI / mies." pole="zmianAiMies" wartosc={konf.wCenieHostingu.zmianAiMies} onChange={(v) => ustawLimity({ zmianAiMies: v })} />
        </div>
      </section>

      <section data-sekcja="ceny" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Tag className="h-4 w-4" aria-hidden /> Pakiet marki i druga marka
        </h2>
        <p className="text-[11px] text-neutral-400">
          Ceny wpisujesz brutto (VAT 23%) – netto liczy się samo (brutto ÷ 1,23, do grosza, jak na fakturze). verris.pl i panel klienta biorą
          ceny stąd.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Liczba
            id={`${id}-pakiet-cena`}
            etykieta="Pakiet marki – cena jednorazowa (brutto, zł)"
            pole="cenaBrutto"
            krok={0.01}
            wartosc={konf.pakiet.cenaBrutto}
            onChange={(v) => ustawPakiet({ cenaBrutto: v })}
            dopisek={bruttoINetto(konf.pakiet.cenaBrutto, nPakiet)}
          />
          <Liczba
            id={`${id}-druga-cena`}
            etykieta="Druga marka – cena jednorazowa (brutto, zł)"
            pole="cenaBrutto"
            krok={0.01}
            wartosc={konf.drugaMarka.cenaBrutto}
            onChange={(v) => ustaw({ drugaMarka: { cenaBrutto: v } })}
            dopisek={bruttoINetto(konf.drugaMarka.cenaBrutto, nDruga)}
          />
          <Liczba id={`${id}-pakiet-serie`} etykieta="Serie propozycji w Pakiecie" pole="serie" wartosc={konf.pakiet.serie} onChange={(v) => ustawPakiet({ serie: v })} />
          <Liczba id={`${id}-pakiet-zmiany`} etykieta="Zmiany AI w Pakiecie" pole="zmianyAi" wartosc={konf.pakiet.zmianyAi} onChange={(v) => ustawPakiet({ zmianyAi: v })} />
          <Liczba
            id={`${id}-pakiet-aktualizacje`}
            etykieta="Aktualizacje szablonów (miesiące)"
            pole="aktualizacjeSzablonowMies"
            wartosc={konf.pakiet.aktualizacjeSzablonowMies}
            onChange={(v) => ustawPakiet({ aktualizacjeSzablonowMies: v })}
          />
        </div>
        <label className="flex items-start gap-3 text-sm text-white">
          <Checkbox id={`${id}-pro-roczny`} checked={konf.pakietWKreatorzeProRocznym} onChange={(e) => ustaw({ pakietWKreatorzeProRocznym: e.target.checked })} className="mt-0.5" />
          <span>
            Pakiet marki w cenie Kreatora Pro opłacanego rocznie
            <span className="block text-[11px] text-neutral-400">Wyłączone (założenie 19.11.2026): Pakiet kupuje się osobno także z Kreatorem Pro.</span>
          </span>
        </label>
        <p data-ceny-zapisane className="text-[11px] text-neutral-400">
          Zapisane teraz: Pakiet {bruttoINetto(dane.ceny.pakiet.brutto, dane.ceny.pakiet.netto)}; druga marka{' '}
          {bruttoINetto(dane.ceny.drugaMarka.brutto, dane.ceny.drugaMarka.netto)}.
        </p>
      </section>

      <section data-sekcja="ai" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <Bot className="h-4 w-4" aria-hidden /> AI i pliki
        </h2>
        <label className="flex items-start gap-3 text-sm text-white">
          <Checkbox id={`${id}-symbole`} checked={konf.symboleAi} onChange={(e) => ustaw({ symboleAi: e.target.checked })} className="mt-0.5" />
          <span>
            Symbole od AI
            <span className="block text-[11px] text-neutral-400">
              Obok sygnetów z biblioteki seria może zawierać symbol narysowany przez AI – tylko po walidatorze SVG. Wyłączone: same sygnety z
              biblioteki.
            </span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${id}-model-gen`} className="text-xs font-medium text-neutral-300">
              Model serii propozycji
            </label>
            <Select id={`${id}-model-gen`} value={konf.modelGeneracji} options={opcjeModeli(dane.modele, konf.modelGeneracji)} onChange={(v) => ustaw({ modelGeneracji: v })} />
            {mg ? <p className="text-[11px] text-neutral-400">{usd(mg.cenaWej)} / {usd(mg.cenaWyj)} za 1 mln tokenów wej./wyj.</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-model-zmian`} className="text-xs font-medium text-neutral-300">
              Model drobnych zmian AI
            </label>
            <Select id={`${id}-model-zmian`} value={konf.modelZmian} options={opcjeModeli(dane.modele, konf.modelZmian)} onChange={(v) => ustaw({ modelZmian: v })} />
            {mz ? <p className="text-[11px] text-neutral-400">{usd(mz.cenaWej)} / {usd(mz.cenaWyj)} za 1 mln tokenów wej./wyj.</p> : null}
          </div>
        </div>
        <p className="text-[11px] text-neutral-400">
          Tylko modele Anthropic, jak w Kreatorze stron. Ceny i nowe modele zmieniasz w{' '}
          <Link href="/settings/ai" className="underline hover:text-white">
            Konfiguracji asystenta
          </Link>
          .
        </p>
        <div className="max-w-xs">
          <Liczba
            id={`${id}-wgranie`}
            etykieta="Maks. rozmiar wgranego logo (MB)"
            pole="maksRozmiarWgraniaMb"
            wartosc={konf.maksRozmiarWgraniaMb}
            onChange={(v) => ustaw({ maksRozmiarWgraniaMb: v })}
            dopisek="SVG, PDF, PNG albo JPG – ścieżki „Mam logo” i „Odświeżenie”."
          />
        </div>
      </section>

      <section data-sekcja="uzycie" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <BarChart3 className="h-4 w-4" aria-hidden /> Użycie w tym miesiącu ({u.miesiac}, UTC)
        </h2>
        {u.zrodlo === 'brak-danych' ? (
          <p data-brak-danych className="text-sm text-neutral-400">
            Brak danych – liczniki marek, serii, zmian AI i sprzedaży pojawią się, gdy klienci zaczną tworzyć marki.
          </p>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ['Marki', `${u.marki.toLocaleString('pl-PL')} (${u.kontaZMarka.toLocaleString('pl-PL')} ${plForm(u.kontaZMarka, 'konto', 'konta', 'kont')})`],
            ['Serie propozycji', u.serie.toLocaleString('pl-PL')],
            ['Zmiany AI', u.zmianyAi.toLocaleString('pl-PL')],
            ['Koszt AI', usd(u.kosztUsd)],
            ['Pakiety marki', u.pakiety.toLocaleString('pl-PL')],
            ['Drugie marki', u.drugieMarki.toLocaleString('pl-PL')],
          ].map(([etykieta, wartosc]) => (
            <div key={etykieta} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs text-neutral-400">{etykieta}</dt>
              <dd className="text-xl font-bold text-white">{u.zrodlo === 'brak-danych' ? '–' : wartosc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex max-w-3xl flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={zapisz}
          disabled={zapis || !konf.modelGeneracji || !konf.modelZmian}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {zapis ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Zapisz ustawienia Kreatora marki
        </button>
        <span role="status" className="text-xs">
          {stan.ok && !zmieniono ? <span className="text-emerald-300">Zapisano – działa od razu.</span> : null}
          {stan.error ? <span className="text-rose-300">{stan.error}</span> : null}
          {zmieniono && !stan.error ? <span className="text-amber-200">Niezapisane zmiany.</span> : null}
        </span>
      </div>
    </div>
  );
}

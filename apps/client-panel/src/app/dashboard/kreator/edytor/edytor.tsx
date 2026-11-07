'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, Check, CloudOff, History, Loader2, Monitor, Rocket, Smartphone } from 'lucide-react';
import { KATALOG_STYLOW, type Motyw, type Strona } from '@verris/kreator/klient';
import { Switch } from '@/components/panel/v2';
import { cx } from '@/components/panel/cx';
import { plForm } from '@/lib/pl';
import { pozostalo, type StanKreatora, type WidokStronyKreatora } from '@/lib/kreator';
import { polecenieAi, przywrocWersje, wybierzPropozycje, zapiszModel, zmienNazweStrony } from '../akcje';
import { klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego, klasaPrzyciskuIkony } from '../wspolne';
import { Struktura } from './struktura';
import { PanelSekcji } from './panel-sekcji';
import { PanelMotywu } from './panel-motywu';
import { PanelSeo } from './panel-seo';
import { PanelAi } from './panel-ai';
import { Historia } from './historia';
import { Publikacja } from './publikacja';
import { Podglad, type WiadomoscPodgladu } from './podglad';
import { NAZWY_SEKCJI, ustaw, walidujWEdytorze, type Sciezka } from './schemat';
import type { KontekstFormularza } from './formularz-sekcji';

/** Autozapis po tylu ms od ostatniej zmiany (Ctrl/Cmd+S zapisuje od razu). */
export const ZWLOKA_ZAPISU_MS = 2000;

export type StanZapisu = 'zapisano' | 'zapisywanie' | 'niezapisane' | 'bledy' | 'blad';
type Zakladka = 'sekcja' | 'motyw' | 'seo' | 'ai';

const ZAKLADKI: { id: Zakladka; nazwa: string }[] = [
  { id: 'sekcja', nazwa: 'Sekcja' },
  { id: 'motyw', nazwa: 'Motyw' },
  { id: 'seo', nazwa: 'Firma i SEO' },
  { id: 'ai', nazwa: 'AI' },
];

/** Z której zakładki i sekcji poprawić błąd pod ścieżką modelu. */
export function celBledu(sciezka: string): { zakladka: Zakladka; podstrona?: number; sekcja?: number } {
  const m = /^strony\.(\d+)(?:\.sekcje\.(\d+))?/.exec(sciezka);
  if (m && m[2] !== undefined) return { zakladka: 'sekcja', podstrona: Number(m[1]), sekcja: Number(m[2]) };
  if (m) return { zakladka: 'seo', podstrona: Number(m[1]) };
  if (sciezka.startsWith('motyw')) return { zakladka: 'motyw' };
  return { zakladka: 'seo' };
}

function OpisZapisu({ stan, bledow }: { stan: StanZapisu; bledow: number }) {
  if (stan === 'zapisano')
    return (
      <>
        <Check className="h-3.5 w-3.5 text-data-hi" aria-hidden /> Zapisano
      </>
    );
  if (stan === 'zapisywanie')
    return (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Zapisywanie…
      </>
    );
  if (stan === 'bledy')
    return (
      <>
        <AlertCircle className="h-3.5 w-3.5 text-crit" aria-hidden /> Niezapisane zmiany – popraw {bledow} {plForm(bledow, 'pole', 'pola', 'pól')}
      </>
    );
  if (stan === 'blad')
    return (
      <>
        <CloudOff className="h-3.5 w-3.5 text-warn" aria-hidden /> Nie zapisano – spróbujemy ponownie
      </>
    );
  return <>Niezapisane zmiany</>;
}

export function Edytor({ widok: widokPoczatkowy, stan }: { widok: WidokStronyKreatora; stan: StanKreatora }) {
  const plan = stan.plan!;
  const funkcjePro = plan.funkcjePro;
  const id = widokPoczatkowy.id;

  const [widok, setWidok] = useState(widokPoczatkowy);
  const [model, setModel] = useState<Strona>(widokPoczatkowy.model!);
  const [rewizja, setRewizja] = useState(0);
  const [zapisana, setZapisana] = useState(0);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [bladZapisu, setBladZapisu] = useState(false);
  const [klucz, setKlucz] = useState(0);
  const [ip, setIp] = useState(0);
  const [zaznaczona, setZaznaczona] = useState<string | null>(widokPoczatkowy.model?.strony[0]?.sekcje[0]?.id ?? null);
  const [przewinDo, setPrzewinDo] = useState<{ id: string; nr: number } | null>(null);
  const [urzadzenie, setUrzadzenie] = useState<'komputer' | 'telefon'>('komputer');
  const [pokazPro, setPokazPro] = useState(false);
  const [zakladka, setZakladka] = useState<Zakladka>('sekcja');
  const [historia, setHistoria] = useState(false);
  const [publikacja, setPublikacja] = useState(false);
  const [pracujeAi, setPracujeAi] = useState(false);
  const [przedAi, setPrzedAi] = useState<Strona | null>(null);
  const [zmianyAi, setZmianyAi] = useState(stan.zuzycie.zmiany);
  const [nazwa, setNazwa] = useState(widokPoczatkowy.nazwa);
  const [ogloszenie, setOgloszenie] = useState('');
  const [propozycjaW, setPropozycjaW] = useState<number | null>(null);

  const walidacja = useMemo(() => walidujWEdytorze(model), [model]);
  const stanZapisu: StanZapisu = zapisywanie
    ? 'zapisywanie'
    : rewizja === zapisana
      ? 'zapisano'
      : !walidacja.ok
        ? 'bledy'
        : bladZapisu
          ? 'blad'
          : 'niezapisane';
  // Bieżące wartości dla wywołań asynchronicznych (zapis, AI) – aktualizowane po każdym renderze.
  const refy = useRef({ model, rewizja, zapisana, walidacja, zapis: null as Promise<boolean> | null });
  useLayoutEffect(() => {
    refy.current.model = model;
    refy.current.rewizja = rewizja;
    refy.current.zapisana = zapisana;
    refy.current.walidacja = walidacja;
  });

  const oglos = (t: string) => {
    setOgloszenie(t);
    toast.message(t);
  };

  const zmienModel = useCallback((fn: (m: Strona) => Strona) => {
    setModel((m) => fn(m));
    setRewizja((r) => r + 1);
  }, []);

  const k: KontekstFormularza = useMemo(
    () => ({ model, bledy: walidacja.bledy, onZmiana: (s: Sciezka, w: unknown) => zmienModel((m) => ustaw(m, s, w)) }),
    [model, walidacja.bledy, zmienModel],
  );

  /** Model z serwera (AI, przywrócenie, propozycja) – zapisany, panele z własnym stanem montują się od nowa. */
  const zastapModel = (w: WidokStronyKreatora) => {
    setWidok(w);
    if (!w.model) return;
    const nowy = w.model;
    setModel(nowy);
    const r = refy.current.rewizja + 1;
    setRewizja(r);
    setZapisana(r);
    refy.current.rewizja = r;
    refy.current.zapisana = r;
    setBladZapisu(false);
    setKlucz((x) => x + 1);
    setIp((i) => Math.min(i, nowy.strony.length - 1));
    setZaznaczona((z) => (z && nowy.strony.some((p) => p.sekcje.some((s) => s.id === z)) ? z : (nowy.strony[0]?.sekcje[0]?.id ?? null)));
  };

  /** Zapis bieżącego modelu (PUT). true = na serwerze jest to, co widać w edytorze. Zapis w toku – czekamy na niego. */
  const zapiszTeraz = useCallback(async (): Promise<boolean> => {
    const r = refy.current;
    if (r.zapis) await r.zapis;
    if (r.rewizja === r.zapisana) return true;
    if (!r.walidacja.ok) return false;
    const rew = r.rewizja;
    const model = r.model;
    setZapisywanie(true);
    r.zapis = (async () => {
      const wynik = await zapiszModel(id, model);
      setZapisywanie(false);
      if (!wynik.ok) {
        setBladZapisu(true);
        toast.error(wynik.bledy?.length ? `${wynik.blad} ${wynik.bledy.slice(0, 2).join('; ')}` : wynik.blad);
        return false;
      }
      setWidok((w) => ({ ...w, zmianyBezPro: wynik.dane.zmianyBezPro, updatedAt: wynik.dane.updatedAt }));
      setZapisana(rew);
      setBladZapisu(false);
      refy.current.zapisana = rew;
      return refy.current.rewizja === rew;
    })();
    try {
      return await r.zapis;
    } finally {
      r.zapis = null;
    }
  }, [id]);

  // Autozapis: 2 s po ostatniej zmianie, tylko poprawny model. Błąd zapisu – kolejna próba przy następnej zmianie
  // albo po 10 s.
  useEffect(() => {
    if (rewizja === zapisana || !walidacja.ok) return;
    const t = setTimeout(() => void zapiszTeraz(), ZWLOKA_ZAPISU_MS);
    return () => clearTimeout(t);
  }, [rewizja, zapisana, walidacja.ok, zapiszTeraz]);

  useEffect(() => {
    if (stanZapisu !== 'blad') return;
    const t = setTimeout(() => void zapiszTeraz(), 10_000);
    return () => clearTimeout(t);
  }, [stanZapisu, zapiszTeraz]);

  // Ctrl/Cmd+S – zapis od razu; ostrzeżenie przeglądarki przy zamykaniu karty z niezapisanymi zmianami.
  useEffect(() => {
    const klawisz = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!refy.current.walidacja.ok) {
          oglos('Popraw zaznaczone pola – strona z błędami nie zapisze się.');
          return;
        }
        void zapiszTeraz();
      }
    };
    const przedZamknieciem = (e: BeforeUnloadEvent) => {
      if (refy.current.rewizja !== refy.current.zapisana) e.preventDefault();
    };
    window.addEventListener('keydown', klawisz);
    window.addEventListener('beforeunload', przedZamknieciem);
    return () => {
      window.removeEventListener('keydown', klawisz);
      window.removeEventListener('beforeunload', przedZamknieciem);
    };
  }, [zapiszTeraz]);

  const podstrona = model.strony[ip] ?? model.strony[0]!;
  const indeksSekcji = podstrona.sekcje.findIndex((s) => s.id === zaznaczona);
  const sekcja = indeksSekcji >= 0 ? podstrona.sekcje[indeksSekcji]! : null;

  const zaznacz = (sid: string | null, przewin = true) => {
    setZaznaczona(sid);
    if (sid) {
      setZakladka((z) => (z === 'ai' ? z : 'sekcja'));
      if (przewin) setPrzewinDo((p) => ({ id: sid, nr: (p?.nr ?? 0) + 1 }));
    }
  };

  const wybranoPro = () => {
    if (!pokazPro) {
      setPokazPro(true);
      oglos('Włączyliśmy podgląd funkcji Pro – element zobaczysz z oznaczeniem „Pro”.');
    }
  };

  const doBledu = () => {
    const pierwszy = [...walidacja.bledy.keys()][0];
    if (pierwszy === undefined) return;
    const cel = celBledu(pierwszy);
    if (cel.podstrona !== undefined && model.strony[cel.podstrona]) setIp(cel.podstrona);
    if (cel.podstrona !== undefined && cel.sekcja !== undefined) {
      const s = model.strony[cel.podstrona]?.sekcje[cel.sekcja];
      if (s) zaznacz(s.id);
    }
    setZakladka(cel.zakladka);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#kr-panel [aria-invalid="true"]')?.focus());
  };

  const wiadomosc = (w: WiadomoscPodgladu) => {
    if (w.typ === 'sekcja') zaznacz(w.id, false);
    else if (w.typ === 'podstrona') {
      const i = model.strony.findIndex((p) => p.slug === w.slug);
      if (i >= 0) {
        setIp(i);
        const cel = w.kotwica ? model.strony[i]!.sekcje.find((s) => s.id === w.kotwica) : model.strony[i]!.sekcje[0];
        if (cel) zaznacz(cel.id, !!w.kotwica);
      }
    } else if (w.typ === 'zewnetrzny') oglos('Linki do innych stron działają na opublikowanej stronie.');
    else oglos('Formularz kontaktowy zadziała na opublikowanej stronie.');
  };

  const zmienNazwe = async () => {
    const nowa = nazwa.trim();
    if (!nowa || nowa === widok.nazwa) {
      setNazwa(widok.nazwa);
      return;
    }
    const r = await zmienNazweStrony(id, nowa);
    if (r.ok) {
      setWidok((w) => ({ ...w, nazwa: r.dane.nazwa }));
      oglos('Zmieniono nazwę strony.');
    } else {
      setNazwa(widok.nazwa);
      toast.error(r.blad);
    }
  };

  const wyslijAi = async (polecenie: string, calaStrona: boolean): Promise<boolean> => {
    if (!(await zapiszTeraz())) {
      toast.error('Najpierw popraw zaznaczone pola – AI pracuje na zapisanej wersji strony.');
      return false;
    }
    setPracujeAi(true);
    setOgloszenie('AI wprowadza zmianę…');
    const poprzedni = refy.current.model;
    const r = await polecenieAi(id, polecenie, calaStrona ? null : zaznaczona);
    setPracujeAi(false);
    if (!r.ok) {
      toast.error(r.blad);
      setOgloszenie('');
      return false;
    }
    setPrzedAi(poprzedni);
    zastapModel(r.dane);
    setZmianyAi((n) => n + 1);
    oglos('Gotowe – zmiana AI zapisana jako nowa wersja.');
    return true;
  };

  const cofnijAi = () => {
    if (!przedAi) return;
    zmienModel(() => przedAi);
    setKlucz((x) => x + 1);
    setPrzedAi(null);
    oglos('Cofnięto zmianę AI – zapiszemy poprzednią wersję.');
  };

  const przywroc = async (numer: number): Promise<boolean> => {
    await zapiszTeraz();
    const r = await przywrocWersje(id, numer);
    if (!r.ok) {
      toast.error(r.blad);
      return false;
    }
    zastapModel(r.dane);
    setPrzedAi(null);
    oglos(`Przywrócono wersję ${numer}.`);
    return true;
  };

  const wybierzPropozycjeN = async (n: number) => {
    if (!(await zapiszTeraz()) && refy.current.rewizja !== refy.current.zapisana) {
      toast.error('Popraw zaznaczone pola, zanim zmienisz projekt – inaczej stracisz zmiany.');
      return;
    }
    setPropozycjaW(n);
    const r = await wybierzPropozycje(id, n);
    setPropozycjaW(null);
    if (!r.ok) {
      toast.error(r.blad);
      return;
    }
    zastapModel(r.dane);
    oglos(`Wybrano propozycję ${n}. Poprzedni projekt czeka na liście propozycji.`);
  };

  const klawiszZakladek = (e: ReactKeyboardEvent, i: number) => {
    const krok = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!krok) return;
    e.preventDefault();
    const nast = ZAKLADKI[(i + krok + ZAKLADKI.length) % ZAKLADKI.length]!;
    setZakladka(nast.id);
    document.getElementById(`kr-tab-${nast.id}`)?.focus();
  };

  const pozostaloAi = pozostalo(plan.zmianAiMies, zmianyAi);
  const sciezkaSekcji: Sciezka = ['strony', ip, 'sekcje', indeksSekcji];
  const propozycje = widok.propozycje.filter((p): p is Strona => !!p && typeof p === 'object' && 'motyw' in (p as object));

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-61px-4.5rem)]">
      {/* Pasek górny */}
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-card px-3 py-2">
        <Link href="/dashboard/kreator" className={klasaPrzyciskuIkony} aria-label="Wróć do listy stron">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <input
          aria-label="Nazwa strony"
          value={nazwa}
          maxLength={80}
          onChange={(e) => setNazwa(e.target.value)}
          onBlur={() => void zmienNazwe()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setNazwa(widok.nazwa);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-2 py-1 font-display text-[16px] font-bold text-foreground outline-none hover:border-line focus:border-data sm:max-w-[280px]"
        />
        <div role="status" aria-live="polite" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {stanZapisu === 'bledy' ? (
            <button type="button" onClick={doBledu} className="inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-0.5 hover:bg-raised">
              <OpisZapisu stan={stanZapisu} bledow={walidacja.bledy.size} />
            </button>
          ) : (
            <OpisZapisu stan={stanZapisu} bledow={walidacja.bledy.size} />
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Rozmiar podglądu" className="flex rounded-[7px] border border-line-strong p-0.5">
            {(
              [
                ['komputer', 'Komputer', Monitor],
                ['telefon', 'Telefon', Smartphone],
              ] as const
            ).map(([w, n, Ikona]) => (
              <button
                key={w}
                type="button"
                aria-pressed={urzadzenie === w}
                onClick={() => setUrzadzenie(w)}
                className={cx('inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px]', urzadzenie === w ? 'bg-data-soft font-semibold text-data-hi' : 'text-muted-foreground hover:text-foreground')}
              >
                <Ikona className="h-3.5 w-3.5" aria-hidden /> {n}
              </button>
            ))}
          </div>
          {!funkcjePro ? (
            <span className="flex items-center gap-2 text-[12.5px] text-foreground">
              <Switch label="Pokaż funkcje Pro w podglądzie" checked={pokazPro} onChange={setPokazPro} />
              <span aria-hidden>Pokaż funkcje Pro</span>
            </span>
          ) : null}
          <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => setHistoria(true)}>
            <History className="h-4 w-4" aria-hidden /> Historia
          </button>
          <button type="button" className={klasaPrzyciskuGlownego} onClick={() => setPublikacja(true)}>
            <Rocket className="h-4 w-4" aria-hidden /> Publikuj
          </button>
        </div>
      </div>

      {propozycje.length ? (
        <section aria-label="Propozycje projektu" className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-card px-3 py-2">
          <span className="text-[12.5px] font-semibold text-foreground">
            {propozycje.length + 1} {plForm(propozycje.length + 1, 'propozycja', 'propozycje', 'propozycji')} projektu:
          </span>
          <span className="inline-flex items-center gap-2 rounded-[7px] border border-data bg-data-soft px-2.5 py-1 text-[12.5px] font-semibold text-data-hi" aria-current="true">
            <Probka m={model} /> Obecny · {KATALOG_STYLOW.find((s) => s.id === model.motyw.styl)?.nazwa ?? model.motyw.styl}
          </span>
          {propozycje.map((p, i) => (
            <button
              key={i}
              type="button"
              disabled={propozycjaW !== null}
              onClick={() => void wybierzPropozycjeN(i + 1)}
              className="inline-flex items-center gap-2 rounded-[7px] border border-line-strong px-2.5 py-1 text-[12.5px] text-foreground hover:bg-raised disabled:opacity-50"
            >
              {propozycjaW === i + 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Probka m={p} />}
              Propozycja {i + 1} · {KATALOG_STYLOW.find((s) => s.id === p.motyw.styl)?.nazwa ?? p.motyw.styl}
            </button>
          ))}
        </section>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_340px] 2xl:grid-cols-[260px_minmax(0,1fr)_380px]">
        <aside aria-label="Struktura strony" className="min-h-0 overflow-y-auto rounded-[10px] border border-line bg-card p-3">
          <Struktura
            model={model}
            podstrona={ip}
            zaznaczona={zaznaczona}
            plan={plan}
            funkcjePro={funkcjePro}
            bledy={walidacja.bledy}
            onPodstrona={(i) => {
              setIp(i);
              setZaznaczona(model.strony[i]?.sekcje[0]?.id ?? null);
            }}
            onZaznacz={(s) => zaznacz(s)}
            onZmiana={zmienModel}
            onKomunikat={oglos}
          />
        </aside>

        <div className="relative h-[70vh] min-h-0 overflow-hidden rounded-[10px] border border-line bg-raised lg:h-auto">
          {!walidacja.ok ? (
            <p className="absolute inset-x-3 top-3 z-10 rounded-[7px] border border-warn/40 bg-card px-3 py-2 text-[12.5px] text-foreground shadow-sm">
              Podgląd pokazuje ostatnią poprawną wersję – popraw zaznaczone pola, a odświeży się sam.
            </p>
          ) : null}
          <Podglad
            model={model}
            podstrona={podstrona.slug}
            pro={funkcjePro || pokazPro}
            zaznaczona={zaznaczona}
            przewinDo={przewinDo}
            urzadzenie={urzadzenie}
            poprawny={walidacja.ok}
            onWiadomosc={wiadomosc}
          />
        </div>

        <aside aria-label="Ustawienia" className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-line bg-card">
          <div role="tablist" aria-label="Panele edycji" className="flex flex-none gap-1 border-b border-line px-2 pt-2">
            {ZAKLADKI.map((z, i) => (
              <button
                key={z.id}
                id={`kr-tab-${z.id}`}
                type="button"
                role="tab"
                aria-selected={zakladka === z.id}
                aria-controls="kr-panel"
                tabIndex={zakladka === z.id ? 0 : -1}
                onClick={() => setZakladka(z.id)}
                onKeyDown={(e) => klawiszZakladek(e, i)}
                className={cx(
                  '-mb-px rounded-t-[6px] border-b-2 px-2.5 py-2 text-[13px] font-medium',
                  zakladka === z.id ? 'border-data text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {z.nazwa}
              </button>
            ))}
          </div>
          <div id="kr-panel" role="tabpanel" aria-labelledby={`kr-tab-${zakladka}`} className="min-h-0 flex-1 overflow-y-auto p-4" tabIndex={0}>
            {zakladka === 'sekcja' ? (
              <PanelSekcji key={`${klucz}-${zaznaczona}`} sekcja={sekcja} sciezka={sciezkaSekcji} k={k} funkcjePro={funkcjePro} onWybranoPro={wybranoPro} />
            ) : null}
            {zakladka === 'motyw' ? (
              <PanelMotywu
                key={klucz}
                model={model}
                funkcjePro={funkcjePro}
                onMotyw={(fn: (m: Motyw) => Motyw) => zmienModel((m) => ({ ...m, motyw: fn(m.motyw) }))}
                onZnak={(z) => zmienModel((m) => ({ ...m, stopka: { ...m.stopka, znakKreatora: z } }))}
                onWybranoPro={wybranoPro}
              />
            ) : null}
            {zakladka === 'seo' ? <PanelSeo key={klucz} model={model} podstrona={ip} k={k} /> : null}
            {zakladka === 'ai' ? (
              <PanelAi
                key={`${klucz}-${zaznaczona}`}
                nazwaSekcji={sekcja ? `${NAZWY_SEKCJI[sekcja.typ]} (${podstrona.tytul})` : null}
                pozostalo={pozostaloAi}
                pracuje={pracujeAi}
                moznaCofnac={!!przedAi}
                onWyslij={wyslijAi}
                onCofnij={cofnijAi}
              />
            ) : null}
          </div>
          {!funkcjePro && widok.zmianyBezPro.length ? (
            <p className="flex-none border-t border-line px-4 py-2.5 text-[12px] text-muted-foreground">
              Bez Kreatora Pro przy publikacji zmieni się {widok.zmianyBezPro.length} {plForm(widok.zmianyBezPro.length, 'element', 'elementy', 'elementów')} – lista w oknie publikacji.
            </p>
          ) : null}
        </aside>
      </div>

      <p className="sr-only" aria-live="polite">
        {ogloszenie}
      </p>

      <Historia id={id} otwarta={historia} onZamknij={() => setHistoria(false)} onPrzywroc={przywroc} />
      <Publikacja
        id={id}
        otwarta={publikacja}
        onZamknij={() => setPublikacja(false)}
        przedPublikacja={zapiszTeraz}
        onOpublikowano={(w) => setWidok((x) => ({ ...x, opublikowanaAt: new Date().toISOString(), ...(w.tryb === 'domena' ? { domena: new URL(w.adres).hostname } : {}) }))}
      />
    </div>
  );
}

function Probka({ m }: { m: Strona }) {
  return (
    <span className="flex h-3.5 w-7 overflow-hidden rounded-[3px] border border-line" aria-hidden>
      <span className="flex-1" style={{ background: m.motyw.paleta.tlo }} />
      <span className="flex-1" style={{ background: m.motyw.paleta.akcent }} />
    </span>
  );
}

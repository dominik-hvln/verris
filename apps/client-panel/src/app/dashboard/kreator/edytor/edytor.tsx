'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Check, CloudOff, Eye, History, ListTree, Loader2, Menu, Monitor, MoreHorizontal, Pencil, Rocket, RotateCcw, Smartphone, Sparkles, X } from 'lucide-react';
import {
  KATALOG_STYLOW,
  podzielSciezke,
  poleObrazu,
  poleTekstowe,
  podstronyWJezyku,
  kluczPodstrony,
  usunWersjeJezykowa,
  wersjeJezykowe,
  wartoscPod,
  zastosujTekst,
  type JezykDodatkowy,
  type Motyw,
  type Obraz,
  type Strona,
} from '@verris/kreator/klient';
import { Switch } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import { cx } from '@/components/panel/cx';
import { klasaPrzyciskuPaska, PasekSkupienia, useSkupienie } from '@/components/panel/tryb-skupienia';
import { plForm } from '@/lib/pl';
import { pozostalo, type StanKreatora, type WidokStronyKreatora } from '@/lib/kreator';
import { generujPonownie, polecenieAi, przywrocWersje, tlumaczStrone, wybierzPropozycje, zapiszModel, zmienNazweStrony } from '../akcje';
import { klasaPrzyciskuGlownego } from '../wspolne';
import { Struktura } from './struktura';
import { kopiaWersjiJezykowej, WERSJA_JEZYKA, WERSJE_JEZYKA, type TrybWersji } from './jezyki';
import { PanelSekcji } from './panel-sekcji';
import { PanelMotywu } from './panel-motywu';
import { PanelSeo } from './panel-seo';
import { PanelAi } from './panel-ai';
import { Historia } from './historia';
import { Publikacja } from './publikacja';
import { Podglad, type TrybEdycji, type WiadomoscDoRamki, type WiadomoscEdycji, type WiadomoscPodgladu } from './podglad';
import { NAZWY_SEKCJI, przesun, ustaw, walidujWEdytorze, type Sciezka } from './schemat';
import { StosZmian } from './cofanie';
import { WyborZdjecia } from './zdjecia/wybor-zdjecia';
import type { KontekstFormularza } from './formularz-sekcji';
import { useOknoModalne, useUkladEdytora } from './uklad';

/** Autozapis po tylu ms od ostatniej zmiany (Ctrl/Cmd+S zapisuje od razu). */
export const ZWLOKA_ZAPISU_MS = 2000;

export type StanZapisu = 'zapisano' | 'zapisywanie' | 'niezapisane' | 'bledy' | 'blad';
type Zakladka = 'sekcja' | 'motyw' | 'seo' | 'ai';
/** Panel widoczny na telefonie (< 768 px) – jeden naraz, wybierany zakładkami na dole ekranu. */
export type WidokMobilny = 'sekcje' | 'podglad' | 'edycja';
type Szuflada = 'sekcje' | 'edycja' | null;

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

/**
 * Paczka 123 – dane firmy klikane w podglądzie (data-k-formularz z renderera: telefon, e-mail, adres, nazwa w linii ©)
 * otwierają pole w zakładce „Firma i SEO”. Tylko te ścieżki – reszta modelu ma własne miejsca w formularzu sekcji.
 */
export function polaFirmyZPodgladu(sciezka: string): boolean {
  return ['firma.nazwa', 'firma.telefon', 'firma.email', 'firma.adres.ulica'].includes(sciezka);
}

/** Pole, w którym Ctrl+Z należy do przeglądarki (cofanie wpisywanego tekstu), a nie do edytora. */
export function wPoluTekstowym(cel: EventTarget | null): boolean {
  if (!(cel instanceof HTMLElement)) return false;
  if (cel.isContentEditable || cel.tagName === 'TEXTAREA') return true;
  return cel.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes((cel as HTMLInputElement).type);
}

function OpisZapisu({ stan, bledow }: { stan: StanZapisu; bledow: number }) {
  if (stan === 'zapisano')
    return (
      <>
        <Check className="h-3.5 w-3.5 text-data-hi" aria-hidden /> <span className="max-lg:sr-only">Zapisano</span>
      </>
    );
  if (stan === 'zapisywanie')
    return (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> <span className="max-lg:sr-only">Zapisywanie…</span>
      </>
    );
  if (stan === 'bledy')
    return (
      <>
        <AlertCircle className="h-3.5 w-3.5 text-crit" aria-hidden />{' '}
        <span className="max-lg:sr-only">
          Niezapisane zmiany – popraw {bledow} {plForm(bledow, 'pole', 'pola', 'pól')}
        </span>
      </>
    );
  if (stan === 'blad')
    return (
      <>
        <CloudOff className="h-3.5 w-3.5 text-warn" aria-hidden /> <span className="max-lg:sr-only">Nie zapisano – spróbujemy ponownie</span>
      </>
    );
  return (
    <>
      <span className="h-2 w-2 rounded-full bg-warn" aria-hidden /> <span className="max-lg:sr-only">Niezapisane zmiany</span>
    </>
  );
}

/** Treść potwierdzenia „Wygeneruj od nowa” (paczka 123). */
export const POTWIERDZENIE_OD_NOWA =
  'AI zbuduje stronę od nowa z opisu firmy podanego przy jej tworzeniu. Obecny projekt zapiszemy w historii wersji – wrócisz do niego w „Historii wersji”. Zużywa jedną generację z miesięcznego limitu.';

export function Edytor({
  widok: widokPoczatkowy,
  stan,
  onGeneruj,
}: {
  widok: WidokStronyKreatora;
  stan: StanKreatora;
  /** Paczka 123 – strona przeszła w generowanie od nowa (StronaKreatora pokazuje ekran postępu). */
  onGeneruj?: (w: WidokStronyKreatora) => void;
}) {
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
  // Edycja na stronie (paczka 122): tekst w ramce podglądu, pasek sekcji, wybór zdjęcia, cofanie lokalne.
  const [edycjaNaStronie, setEdycjaNaStronie] = useState(true);
  const [zRamki, setZRamki] = useState<{ przed: Strona; po: Strona } | null>(null);
  const [fokusPola, setFokusPola] = useState<{ sciezka: string; nr: number } | null>(null);
  const [wyborZdjecia, setWyborZdjecia] = useState<string | null>(null);
  const kanalRef = useRef<((m: WiadomoscDoRamki) => void) | null>(null);
  const stos = useRef(new StosZmian<Strona>());

  // Układ responsywny (paczka 121): wygląd z klas CSS, tu tylko zachowanie szuflad i zakładek telefonu.
  const uklad = useUkladEdytora();
  const skupienie = useSkupienie();
  const [szuflada, setSzuflada] = useState<Szuflada>(null);
  const [widokMobilny, setWidokMobilny] = useState<WidokMobilny>('podglad');
  const [wiecej, setWiecej] = useState(false);
  const [pelnyEkran, setPelnyEkran] = useState(false);
  // Zmiana układu (obrót tabletu, zmiana okna) zamyka szuflady – panel mógł właśnie stać się kolumną.
  const [poprzedniUklad, setPoprzedniUklad] = useState(uklad);
  if (uklad !== poprzedniUklad) {
    setPoprzedniUklad(uklad);
    setSzuflada(null);
  }
  const szufladaSekcji = useRef<HTMLElement>(null);
  const szufladaEdycji = useRef<HTMLElement>(null);
  const przyciskWiecej = useRef<HTMLButtonElement>(null);
  const menuWiecej = useRef<HTMLDivElement>(null);
  const zamknijSzuflade = useCallback(() => setSzuflada(null), []);
  useOknoModalne(szuflada === 'sekcje', zamknijSzuflade, szufladaSekcji);
  useOknoModalne(szuflada === 'edycja', zamknijSzuflade, szufladaEdycji);

  // „Więcej” (menu rozwijane): Esc i kliknięcie obok zamykają, Esc oddaje fokus przyciskowi.
  useEffect(() => {
    if (!wiecej) return;
    const klawisz = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setWiecej(false);
      przyciskWiecej.current?.focus();
    };
    const klik = (e: PointerEvent) => {
      const cel = e.target as Node;
      if (!menuWiecej.current?.contains(cel) && !przyciskWiecej.current?.contains(cel)) setWiecej(false);
    };
    window.addEventListener('keydown', klawisz);
    window.addEventListener('pointerdown', klik);
    return () => {
      window.removeEventListener('keydown', klawisz);
      window.removeEventListener('pointerdown', klik);
    };
  }, [wiecej]);

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

  /** Cofnięcie / ponowienie lokalnej zmiany (stos w pamięci; historia wersji w API – osobno, w „Historii”). */
  const przejdzWStosie = (kierunek: 'cofnij' | 'ponow') => {
    const nowy = kierunek === 'cofnij' ? stos.current.cofnij(refy.current.model) : stos.current.ponow(refy.current.model);
    if (!nowy) {
      oglos(kierunek === 'cofnij' ? 'Nie ma zmian do cofnięcia.' : 'Nie ma zmian do ponowienia.');
      return;
    }
    refy.current.model = nowy;
    setModel(nowy);
    setZRamki(null);
    setRewizja((r) => r + 1);
    setKlucz((x) => x + 1);
    setIp((i) => Math.min(i, nowy.strony.length - 1));
    setZaznaczona((z) => (z && nowy.strony.some((p) => p.sekcje.some((x) => x.id === z)) ? z : (nowy.strony[0]?.sekcje[0]?.id ?? null)));
    oglos(kierunek === 'cofnij' ? 'Cofnięto zmianę.' : 'Przywrócono zmianę.');
  };
  const akcje = useRef({ cofnij: () => undefined as void, ponow: () => undefined as void });
  useLayoutEffect(() => {
    akcje.current = { cofnij: () => przejdzWStosie('cofnij'), ponow: () => przejdzWStosie('ponow') };
  });

  /**
   * Każda lokalna zmiana modelu (formularz, struktura, motyw, ramka) idzie tędy: bieżący model z refy (kolejne zmiany
   * w jednym zdarzeniu składają się poprawnie) i wpis na stosie cofania. `klucz` – ścieżka pola: szybkie pisanie
   * w jednym polu to jeden krok cofania.
   */
  const zmienModel = useCallback((fn: (m: Strona) => Strona, klucz?: string) => {
    const przed = refy.current.model;
    const po = fn(przed);
    if (po === przed) return;
    stos.current.zapisz(przed, klucz);
    refy.current.model = po;
    setModel(po);
    setRewizja((r) => r + 1);
    // Ramka pokazuje model z ramki tylko do następnej zmiany spoza niej (przyjmijTekst ustawia to po tej funkcji).
    setZRamki(null);
  }, []);

  const k: KontekstFormularza = useMemo(
    () => ({ model, bledy: walidacja.bledy, onZmiana: (s: Sciezka, w: unknown) => zmienModel((m) => ustaw(m, s, w), s.join('.')) }),
    [model, walidacja.bledy, zmienModel],
  );

  /** Model z serwera (AI, przywrócenie, propozycja) – zapisany, panele z własnym stanem montują się od nowa. */
  const zastapModel = (w: WidokStronyKreatora) => {
    setWidok(w);
    if (!w.model) return;
    const nowy = w.model;
    // Model z serwera (AI, przywrócona wersja, propozycja) – lokalny stos cofania zaczyna się od nowa.
    stos.current.wyczysc();
    refy.current.model = nowy;
    setModel(nowy);
    setZRamki(null);
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
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      const litera = e.key.toLowerCase();
      // Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y – cofanie lokalne; w polu tekstowym zostaje cofanie przeglądarki.
      if (mod && (litera === 'z' || litera === 'y') && !wPoluTekstowym(e.target)) {
        e.preventDefault();
        if (litera === 'y' || e.shiftKey) akcje.current.ponow();
        else akcje.current.cofnij();
        return;
      }
      if (mod && litera === 's') {
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

  /** Pokaż panel edycji: na telefonie zakładka „Edytuj”, na wąskim ekranie szuflada z prawej, szerzej – kolumna. */
  const pokazEdycje = () => {
    if (uklad === 'telefon') setWidokMobilny('edycja');
    else if (uklad === 'waski') setSzuflada('edycja');
  };

  /**
   * Zaznaczenie sekcji. Z listy sekcji (`struktura`) od razu do edycji; z podglądu – szuflada edycji na wąskim
   * ekranie, a na telefonie bez zmiany zakładki (dotknięcia w podglądzie to zwykle przewijanie i oglądanie).
   */
  const zaznacz = (sid: string | null, przewin = true, zrodlo: 'struktura' | 'podglad' | 'inne' = 'inne') => {
    setZaznaczona(sid);
    if (sid) {
      setZakladka((z) => (z === 'ai' ? z : 'sekcja'));
      if (przewin) setPrzewinDo((p) => ({ id: sid, nr: (p?.nr ?? 0) + 1 }));
      if (zrodlo === 'struktura') {
        if (uklad === 'sredni') setSzuflada(null);
        else pokazEdycje();
      } else if (zrodlo === 'podglad' && uklad === 'waski') setSzuflada('edycja');
    }
  };

  /** Pomiń do podglądu / do edycji (skip link) – na telefonie i w szufladach najpierw pokazuje panel. */
  const przejdzDo = (e: ReactMouseEvent, cel: 'podglad' | 'edycja') => {
    e.preventDefault();
    if (cel === 'podglad') {
      setSzuflada(null);
      if (uklad === 'telefon') setWidokMobilny('podglad');
      requestAnimationFrame(() => document.getElementById('kr-podglad')?.focus());
    } else {
      pokazEdycje();
      // W szufladzie fokus ustawia sama szuflada.
      if (uklad !== 'waski') requestAnimationFrame(() => document.getElementById('kr-edycja')?.focus());
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
    pokazEdycje();
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#kr-panel [aria-invalid="true"]')?.focus());
  };

  const wiadomosc = (w: WiadomoscPodgladu) => {
    if (w.typ === 'sekcja') zaznacz(w.id, false, 'podglad');
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

  /** Pole formularza po ścieżce modelu: zakładka, podstrona i sekcja jak przy błędzie, panel edycji, fokus na polu. */
  const otworzPole = (sciezka: string) => {
    const cel = celBledu(sciezka);
    if (cel.podstrona !== undefined && model.strony[cel.podstrona]) setIp(cel.podstrona);
    if (cel.podstrona !== undefined && cel.sekcja !== undefined) {
      const s = model.strony[cel.podstrona]?.sekcje[cel.sekcja];
      if (s) setZaznaczona(s.id);
    }
    setZakladka(cel.zakladka);
    pokazEdycje();
    setFokusPola((f) => ({ sciezka, nr: (f?.nr ?? 0) + 1 }));
  };

  // Fokus na polu po ścieżce (`data-sciezka` w formularzu) – po wyrenderowaniu zakładki; kilka klatek zapasu.
  useEffect(() => {
    if (!fokusPola) return;
    let proby = 0;
    let klatka = 0;
    const szukaj = () => {
      const panel = document.getElementById('kr-panel');
      const pole = [...(panel?.querySelectorAll<HTMLElement>('[data-sciezka]') ?? [])].find((e) => e.dataset.sciezka === fokusPola.sciezka);
      if (pole && !(pole as HTMLInputElement).disabled) {
        pole.focus({ preventScroll: true });
        pole.scrollIntoView?.({ block: 'center' });
        return;
      }
      if (++proby < 12) klatka = requestAnimationFrame(szukaj);
      else panel?.focus();
    };
    klatka = requestAnimationFrame(szukaj);
    return () => cancelAnimationFrame(klatka);
  }, [fokusPola]);

  /** Tekst wpisany w ramce: walidacja ścieżki i limitu (@verris/kreator), zmiana modelu bez przeładowania ramki. */
  const przyjmijTekst = (sciezka: string, wartosc: string) => {
    const przed = refy.current.model;
    const w = zastosujTekst(przed, sciezka, wartosc);
    if (!w.ok) {
      if (w.powod === 'pusty') {
        const stary = wartoscPod(przed, sciezka);
        if (typeof stary === 'string') kanalRef.current?.({ typ: 'tekst-z-zewnatrz', sciezka, wartosc: stary });
        oglos('To pole nie może być puste – przywróciliśmy poprzedni tekst.');
      }
      return;
    }
    // Ramka pokazuje tekst przed oczyszczeniem/przycięciem – wyrównujemy go z modelem.
    if (w.wartosc !== wartosc) kanalRef.current?.({ typ: 'tekst-z-zewnatrz', sciezka, wartosc: w.wartosc });
    if (!w.zmiana) return;
    zmienModel(() => w.model, sciezka);
    if (!w.przerysuj) setZRamki({ przed, po: w.model });
    if (w.przycieto) oglos('Tekst przycięty do limitu znaków tego pola.');
  };

  /** Przyciski paska sekcji w ramce → te same akcje co w panelu (lista sekcji, zakładki). */
  const polecenieSekcji = (sekcjaId: string, polecenie: 'w-gore' | 'w-dol' | 'ukryj' | 'ai' | 'opcje', sciezka?: string) => {
    const strona = refy.current.model.strony[ip];
    const i = strona?.sekcje.findIndex((s) => s.id === sekcjaId) ?? -1;
    if (!strona || i < 0) return;
    const nazwaSek = NAZWY_SEKCJI[strona.sekcje[i]!.typ];
    const zmienSekcje = (fn: (l: Strona['strony'][number]['sekcje']) => Strona['strony'][number]['sekcje']) =>
      zmienModel((m) => ({ ...m, strony: m.strony.map((p, j) => (j === ip ? { ...p, sekcje: fn(p.sekcje) } : p)) }));
    if (polecenie === 'w-gore' || polecenie === 'w-dol') {
      const na = polecenie === 'w-gore' ? i - 1 : i + 1;
      if (na < 0 || na >= strona.sekcje.length) return;
      zmienSekcje((l) => przesun(l, i, na));
      setZaznaczona(sekcjaId);
      oglos(`Przeniesiono sekcję „${nazwaSek}” ${polecenie === 'w-gore' ? 'wyżej' : 'niżej'}.`);
    } else if (polecenie === 'ukryj') {
      zmienSekcje((l) => l.map((s, j) => (j === i ? { ...s, ukryta: true } : s)));
      oglos(`Ukryto sekcję „${nazwaSek}”. Przywrócisz ją na liście sekcji (ikona oka) albo skrótem Ctrl+Z.`);
    } else if (polecenie === 'ai') {
      setZaznaczona(sekcjaId);
      setZakladka('ai');
      pokazEdycje();
    } else if (sciezka && (sciezka.startsWith(`strony.${ip}.sekcje.${i}.`) || polaFirmyZPodgladu(sciezka))) {
      otworzPole(sciezka);
    } else {
      setZaznaczona(sekcjaId);
      setZakladka('sekcja');
      pokazEdycje();
    }
  };

  /** Wiadomości mostka z ramki (kształt sprawdził już podgląd: v:1, źródło = nasza ramka). */
  const wiadomoscEdycji = (w: WiadomoscEdycji) => {
    const naStronie = (sid: string) => !!podstrona.sekcje.some((s) => s.id === sid);
    switch (w.typ) {
      case 'zaznacz':
        if (!naStronie(w.sekcja)) return;
        // Telefon: stuknięcie w tekst otwiera zakładkę „Edytuj” z fokusem na tym polu.
        if (w.sciezka && uklad === 'telefon' && poleTekstowe(refy.current.model, w.sciezka)) {
          otworzPole(w.sciezka);
          return;
        }
        zaznacz(w.sekcja, false);
        return;
      case 'tekst':
        przyjmijTekst(w.sciezka, w.wartosc);
        return;
      case 'obraz':
        if (poleObrazu(refy.current.model, w.sciezka)) setWyborZdjecia(w.sciezka);
        return;
      case 'polecenie':
        if (naStronie(w.sekcja)) polecenieSekcji(w.sekcja, w.polecenie, w.sciezka);
        return;
      case 'pole':
        // Dane firmy z nagłówka i stopki (telefon, e-mail, adres, linia ©) – zakładka „Firma i SEO” z fokusem na polu.
        if (polaFirmyZPodgladu(w.sciezka)) otworzPole(w.sciezka);
        return;
      case 'skrot':
        if (w.skrot === 'cofnij') przejdzWStosie('cofnij');
        else if (w.skrot === 'ponow') przejdzWStosie('ponow');
        else if (refy.current.walidacja.ok) void zapiszTeraz();
        else oglos('Popraw zaznaczone pola – strona z błędami nie zapisze się.');
        return;
    }
  };

  const trybEdycji: TrybEdycji = !edycjaNaStronie ? 'brak' : uklad === 'telefon' ? 'zaznacz' : 'edycja';

  // Ponowna generacja gotowej strony nie wyszła – API zostawiło poprzedni projekt i opis błędu (paczka 123).
  useEffect(() => {
    if (widokPoczatkowy.status === 'GOTOWA' && widokPoczatkowy.bladOpis) toast.error(widokPoczatkowy.bladOpis);
  }, [widokPoczatkowy.status, widokPoczatkowy.bladOpis]);

  /**
   * „Wygeneruj od nowa” (paczka 123, menu „Więcej”): po potwierdzeniu zapis bieżących zmian, potem ta sama strona
   * generowana od nowa z zapisanego opisu firmy (bieżący projekt trafia do historii wersji w API).
   */
  const [generuje, setGeneruje] = useState(false);
  const generujOdNowa = async () => {
    przyciskWiecej.current?.focus();
    setWiecej(false);
    if (!(await potwierdz(POTWIERDZENIE_OD_NOWA, { tytul: 'Wygenerować stronę od nowa?', akcja: 'Wygeneruj od nowa' }))) return;
    if (!(await zapiszTeraz()) && refy.current.rewizja !== refy.current.zapisana) {
      toast.error('Popraw zaznaczone pola, zanim wygenerujesz stronę od nowa – inaczej stracisz zmiany.');
      return;
    }
    setGeneruje(true);
    const r = await generujPonownie(id);
    setGeneruje(false);
    if (!r.ok) {
      toast.error(r.blad);
      return;
    }
    onGeneruj?.(r.dane);
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
    // Paczka 124: sekcja na bieżącej podstronie (wersje językowe mają sekcje o tych samych id co oryginał).
    const r = await polecenieAi(id, polecenie, calaStrona ? null : zaznaczona, calaStrona ? undefined : (refy.current.model.strony[ip]?.slug ?? undefined));
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

  /**
   * Paczka 124 – wersje językowe. Tłumaczenie AI (Kreator Pro): najpierw zapis, potem podstrona po podstronie (każda to
   * osobne żądanie i jedna zmiana AI), strona główna pierwsza; model z serwera po każdej podstronie (widać postęp).
   */
  const [tlumaczy, setTlumaczy] = useState(false);
  const przetlumacz = async (jezyk: JezykDodatkowy, klucze: string[]) => {
    if (!funkcjePro || tlumaczy) return;
    if (!(await zapiszTeraz())) {
      toast.error('Najpierw popraw zaznaczone pola – AI tłumaczy zapisaną wersję strony.');
      return;
    }
    const poprzedni = refy.current.model;
    const biezaca = poprzedni.strony[ip];
    const nowy = !poprzedni.strony.some((p) => p.slug === jezyk);
    const kolejka = [...new Set(nowy || klucze.includes('') ? ['', ...klucze] : klucze)];
    setTlumaczy(true);
    let ostatni: WidokStronyKreatora | null = null;
    let nieudane = 0;
    for (let n = 0; n < kolejka.length; n++) {
      setOgloszenie(`Tłumaczę podstronę ${n + 1} z ${kolejka.length} – wersja ${WERSJA_JEZYKA[jezyk]}…`);
      const r = await tlumaczStrone(id, jezyk, [kolejka[n]!]);
      if (!r.ok) {
        nieudane++;
        toast.error(r.blad);
        // Bez strony głównej nowej wersji dalsze podstrony nie mają sensu; 403 = brak Pro albo limit zmian AI.
        if ((nowy && n === 0) || r.status === 403) break;
        continue;
      }
      ostatni = r.dane;
      nieudane += r.dane.nieprzetlumaczone.length;
      setZmianyAi((x) => x + r.dane.przetlumaczone.length);
      zastapModel(r.dane);
    }
    setTlumaczy(false);
    if (!ostatni?.model) {
      setOgloszenie('');
      return;
    }
    setPrzedAi(poprzedni);
    const m = ostatni.model;
    const cel = (biezaca && wersjeJezykowe(m, biezaca).find((w) => w.jezyk === jezyk)?.podstrona) ?? m.strony.find((p) => p.slug === jezyk);
    if (cel) {
      setIp(m.strony.indexOf(cel));
      setZaznaczona(cel.sekcje[0]?.id ?? null);
    }
    oglos(nieudane ? `Przetłumaczono część podstron – ${nieudane} do ponowienia.` : `Gotowe – wersja ${WERSJA_JEZYKA[jezyk]} zapisana jako nowa wersja strony.`);
  };

  const dodajWersje = (jezyk: JezykDodatkowy, tryb: TrybWersji) => {
    if (!funkcjePro) return;
    if (tryb === 'ai') {
      void przetlumacz(jezyk, podstronyWJezyku(refy.current.model, refy.current.model.jezyk).map((p) => kluczPodstrony(refy.current.model, p)));
      return;
    }
    const nowy = kopiaWersjiJezykowej(refy.current.model, jezyk);
    zmienModel(() => nowy);
    const i = nowy.strony.findIndex((p) => p.slug === jezyk);
    if (i >= 0) {
      setIp(i);
      setZaznaczona(nowy.strony[i]!.sekcje[0]?.id ?? null);
    }
    setKlucz((x) => x + 1);
    oglos(`Dodano wersję ${WERSJE_JEZYKA[jezyk]} – kopia bez tłumaczenia. Przetłumacz teksty w edytorze albo przez AI.`);
  };

  const usunWersje = async (jezyk: JezykDodatkowy) => {
    if (!(await potwierdz(`Usunąć wersję ${WERSJE_JEZYKA[jezyk]} strony – wszystkie jej podstrony? Wrócisz do niej w historii wersji.`, { akcja: 'Usuń', niebezpieczne: true, tytul: 'Usunąć wersję językową?' }))) return;
    zmienModel((m) => usunWersjeJezykowa(m, jezyk));
    setIp(0);
    setZaznaczona(refy.current.model.strony[0]?.sekcje[0]?.id ?? null);
    setKlucz((x) => x + 1);
    oglos(`Usunięto wersję ${WERSJE_JEZYKA[jezyk]}.`);
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

  const edycjaSwitch = (
    <span className="flex items-center gap-2 text-[12.5px] text-foreground">
      <Switch label="Edycja na stronie – kliknij tekst w podglądzie, żeby go zmienić" checked={edycjaNaStronie} onChange={setEdycjaNaStronie} />
      <span aria-hidden>Edycja na stronie</span>
    </span>
  );

  const proSwitch = !funkcjePro ? (
    <span className="flex items-center gap-2 text-[12.5px] text-foreground">
      <Switch label="Pokaż funkcje Pro w podglądzie" checked={pokazPro} onChange={setPokazPro} />
      <span aria-hidden>Pokaż funkcje Pro</span>
    </span>
  ) : null;

  const zakladkiMobilne: { id: string; nazwa: string; Ikona: typeof Eye; aktywna: boolean; wybierz: () => void }[] = [
    { id: 'sekcje', nazwa: 'Sekcje', Ikona: ListTree, aktywna: widokMobilny === 'sekcje', wybierz: () => setWidokMobilny('sekcje') },
    { id: 'podglad', nazwa: 'Podgląd', Ikona: Eye, aktywna: widokMobilny === 'podglad', wybierz: () => setWidokMobilny('podglad') },
    {
      id: 'edytuj',
      nazwa: 'Edytuj',
      Ikona: Pencil,
      aktywna: widokMobilny === 'edycja' && zakladka !== 'ai',
      wybierz: () => {
        setWidokMobilny('edycja');
        setZakladka((z) => (z === 'ai' ? 'sekcja' : z));
      },
    },
    {
      id: 'ai',
      nazwa: 'AI',
      Ikona: Sparkles,
      aktywna: widokMobilny === 'edycja' && zakladka === 'ai',
      wybierz: () => {
        setWidokMobilny('edycja');
        setZakladka('ai');
      },
    },
  ];

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <h1 className="sr-only">Edytor strony „{widok.nazwa}”</h1>
      {/* Skip linki (WCAG 2.4.1) – widoczne po fokusie z klawiatury. */}
      <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-2 focus-within:top-2 focus-within:z-[95] focus-within:flex focus-within:gap-2">
        <a href="#kr-podglad" onClick={(e) => przejdzDo(e, 'podglad')} className="rounded-[7px] border border-line-strong bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-lg">
          Przejdź do podglądu
        </a>
        <a href="#kr-edycja" onClick={(e) => przejdzDo(e, 'edycja')} className="rounded-[7px] border border-line-strong bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-lg">
          Przejdź do edycji
        </a>
      </div>

      {/* Pasek edytora na całą szerokość (tryb skupienia – bez menu bocznego panelu) */}
      <PasekSkupienia kompaktowy>
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
          className="min-h-11 min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-1.5 py-1 font-display text-[15px] font-bold text-foreground outline-none hover:border-line focus:border-data sm:px-2 sm:text-[16px] md:min-h-9 lg:max-w-[280px]"
        />
        <div role="status" aria-live="polite" className="flex flex-none items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {stanZapisu === 'bledy' ? (
            <button type="button" onClick={doBledu} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[6px] px-1.5 py-0.5 hover:bg-raised md:min-h-0 md:min-w-0">
              <OpisZapisu stan={stanZapisu} bledow={walidacja.bledy.size} />
            </button>
          ) : (
            <OpisZapisu stan={stanZapisu} bledow={walidacja.bledy.size} />
          )}
        </div>
        <div className="ml-auto flex flex-none items-center gap-1 sm:gap-1.5">
          <div role="group" aria-label="Rozmiar podglądu" className="flex rounded-[7px] border border-line-strong p-0.5 max-md:hidden">
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
                className={cx('inline-flex min-h-8 items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px]', urzadzenie === w ? 'bg-data-soft font-semibold text-data-hi' : 'text-muted-foreground hover:text-foreground')}
              >
                <Ikona className="h-3.5 w-3.5" aria-hidden /> <span className="max-xl:sr-only">{n}</span>
              </button>
            ))}
          </div>
          <span className="max-xl:hidden">{edycjaSwitch}</span>
          <span className="max-xl:hidden">{proSwitch}</span>
          <button type="button" className={cx(klasaPrzyciskuPaska, 'border border-line-strong px-3 max-xl:hidden')} onClick={() => setHistoria(true)}>
            <History className="h-4 w-4" aria-hidden /> Historia
          </button>
          <button
            type="button"
            className={cx(klasaPrzyciskuPaska, 'border border-line-strong px-3 max-md:hidden min-[90rem]:hidden')}
            aria-expanded={szuflada === 'sekcje'}
            aria-controls="kr-struktura"
            onClick={() => setSzuflada('sekcje')}
          >
            <ListTree className="h-4 w-4" aria-hidden /> Sekcje
          </button>
          <button
            type="button"
            className={cx(klasaPrzyciskuPaska, 'border border-line-strong px-3 max-md:hidden lg:hidden')}
            aria-expanded={szuflada === 'edycja'}
            aria-controls="kr-edycja"
            onClick={() => setSzuflada('edycja')}
          >
            <Pencil className="h-4 w-4" aria-hidden /> Edytuj
          </button>
          <button type="button" className={cx(klasaPrzyciskuGlownego, 'min-h-11 px-3 md:min-h-9')} onClick={() => setPublikacja(true)}>
            <Rocket className="h-4 w-4" aria-hidden /> Publikuj
          </button>
          <div className="relative">
            <button
              ref={przyciskWiecej}
              type="button"
              className={klasaPrzyciskuPaska}
              aria-label="Więcej"
              aria-expanded={wiecej}
              aria-controls="kr-wiecej"
              onClick={() => setWiecej((w) => !w)}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </button>
            {wiecej ? (
              <div
                ref={menuWiecej}
                id="kr-wiecej"
                className="absolute right-0 top-full z-[60] mt-1 flex w-64 flex-col gap-0.5 rounded-[10px] border border-line-strong bg-card p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
              >
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-[7px] px-2.5 text-left text-sm text-foreground hover:bg-raised md:min-h-9 xl:hidden"
                  onClick={() => {
                    // Fokus na „Więcej” przed otwarciem okna – po jego zamknięciu wróci tutaj, a nie na zniknięty element menu.
                    przyciskWiecej.current?.focus();
                    setWiecej(false);
                    setHistoria(true);
                  }}
                >
                  <History className="h-4 w-4" aria-hidden /> Historia wersji
                </button>
                <div className="flex min-h-11 items-center px-2.5 max-md:hidden md:min-h-9 xl:hidden">{edycjaSwitch}</div>
                {proSwitch ? <div className="flex min-h-11 items-center px-2.5 md:min-h-9 xl:hidden">{proSwitch}</div> : null}
                <button
                  type="button"
                  disabled={generuje}
                  className="flex min-h-11 items-center gap-2 rounded-[7px] px-2.5 text-left text-sm text-foreground hover:bg-raised disabled:opacity-50 md:min-h-9"
                  onClick={() => void generujOdNowa()}
                >
                  {generuje ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />} Wygeneruj od nowa
                </button>
                {skupienie ? (
                  <button
                    type="button"
                    className="flex min-h-11 items-center gap-2 rounded-[7px] px-2.5 text-left text-sm text-foreground hover:bg-raised md:hidden"
                    onClick={() => {
                      setWiecej(false);
                      skupienie.otworzMenu(przyciskWiecej.current);
                    }}
                  >
                    <Menu className="h-4 w-4" aria-hidden /> Menu panelu
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </PasekSkupienia>

      {propozycje.length ? (
        <section
          aria-label="Propozycje projektu"
          className="mx-2 mt-2 flex flex-none items-center gap-2 overflow-x-auto rounded-[10px] border border-line bg-card px-3 py-2 md:mx-3 md:mt-3 md:flex-wrap"
        >
          <span className="flex-none text-[12.5px] font-semibold text-foreground">
            {propozycje.length + 1} {plForm(propozycje.length + 1, 'propozycja', 'propozycje', 'propozycji')} projektu:
          </span>
          <span className="inline-flex flex-none items-center gap-2 rounded-[7px] border border-data bg-data-soft px-2.5 py-1 text-[12.5px] font-semibold text-data-hi" aria-current="true">
            <Probka m={model} /> Obecny · {KATALOG_STYLOW.find((s) => s.id === model.motyw.styl)?.nazwa ?? model.motyw.styl}
          </span>
          {propozycje.map((p, i) => (
            <button
              key={i}
              type="button"
              disabled={propozycjaW !== null}
              onClick={() => void wybierzPropozycjeN(i + 1)}
              className="inline-flex min-h-11 flex-none items-center gap-2 rounded-[7px] border border-line-strong px-2.5 py-1 text-[12.5px] text-foreground hover:bg-raised disabled:opacity-50 md:min-h-0"
            >
              {propozycjaW === i + 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Probka m={p} />}
              Propozycja {i + 1} · {KATALOG_STYLOW.find((s) => s.id === p.motyw.styl)?.nazwa ?? p.motyw.styl}
            </button>
          ))}
        </section>
      ) : null}

      {szuflada ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Zamknij panel"
          className="fixed inset-0 z-[65] bg-black/50 animate-in fade-in duration-200 motion-reduce:animate-none"
          onClick={zamknijSzuflade}
        />
      ) : null}

      {/*
        Obszar roboczy. Klasy według szerokości (bez nakładania się zakresów):
        < 768 (max-md) – jeden panel naraz; 768–1023 (md:max-lg) – podgląd, edycja w szufladzie;
        768–1439 (md:max-[90rem]) – struktura w szufladzie; ≥ 1024 (lg) – edycja kolumną; ≥ 1440 – trzy kolumny.
      */}
      <div className="flex min-h-0 flex-1 flex-col md:gap-3 md:p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] min-[90rem]:grid-cols-[260px_minmax(0,1fr)_380px]">
        <aside
          ref={szufladaSekcji}
          id="kr-struktura"
          tabIndex={-1}
          {...(szuflada === 'sekcje' ? { role: 'dialog' as const, 'aria-modal': true as const, 'aria-label': 'Sekcje strony' } : { 'aria-label': 'Struktura strony' })}
          className={cx(
            'min-h-0 overflow-y-auto bg-card outline-none',
            'min-[90rem]:block min-[90rem]:rounded-[10px] min-[90rem]:border min-[90rem]:border-line min-[90rem]:p-3',
            szuflada === 'sekcje'
              ? 'md:max-[90rem]:fixed md:max-[90rem]:inset-y-0 md:max-[90rem]:left-0 md:max-[90rem]:z-[70] md:max-[90rem]:block md:max-[90rem]:w-[min(340px,88vw)] md:max-[90rem]:border-r md:max-[90rem]:border-line-strong md:max-[90rem]:p-4 md:max-[90rem]:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] animate-in slide-in-from-left duration-200 motion-reduce:animate-none'
              : 'md:max-[90rem]:hidden',
            widokMobilny === 'sekcje' ? 'max-md:block max-md:flex-1 max-md:p-3' : 'max-md:hidden',
          )}
        >
          <div className="mb-3 hidden items-center justify-between gap-2 md:max-[90rem]:flex">
            <p className="m-0 font-display text-[15px] font-bold text-foreground">Sekcje strony</p>
            <button type="button" className={klasaPrzyciskuPaska} aria-label="Zamknij panel sekcji" onClick={zamknijSzuflade}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
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
            onZaznacz={(s) => zaznacz(s, true, 'struktura')}
            onZmiana={zmienModel}
            onKomunikat={oglos}
            onDodajWersje={dodajWersje}
            onUsunWersje={(j) => void usunWersje(j)}
            onPrzetlumacz={(j, klucze) => void przetlumacz(j, klucze)}
            tlumaczy={tlumaczy}
          />
        </aside>

        <section
          id="kr-podglad"
          tabIndex={-1}
          aria-label="Podgląd strony"
          className={cx(
            'relative min-h-0 overflow-hidden bg-raised outline-none md:flex-1 md:rounded-[10px] md:border md:border-line lg:flex-none',
            widokMobilny === 'podglad' ? 'max-md:flex-1' : 'max-md:hidden',
          )}
        >
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
            onPelnyEkran={() => setPelnyEkran(true)}
            onWiadomosc={wiadomosc}
            edycja={trybEdycji}
            zRamki={zRamki}
            kanalRef={kanalRef}
            onEdycja={wiadomoscEdycji}
          />
        </section>

        <aside
          ref={szufladaEdycji}
          id="kr-edycja"
          tabIndex={-1}
          {...(szuflada === 'edycja' ? { role: 'dialog' as const, 'aria-modal': true as const, 'aria-label': 'Edycja' } : { 'aria-label': 'Ustawienia' })}
          className={cx(
            'min-h-0 flex-col overflow-hidden bg-card outline-none',
            'lg:flex lg:rounded-[10px] lg:border lg:border-line',
            szuflada === 'edycja'
              ? 'md:max-lg:fixed md:max-lg:inset-y-0 md:max-lg:right-0 md:max-lg:z-[70] md:max-lg:flex md:max-lg:w-[min(420px,92vw)] md:max-lg:border-l md:max-lg:border-line-strong md:max-lg:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] animate-in slide-in-from-right duration-200 motion-reduce:animate-none'
              : 'md:max-lg:hidden',
            widokMobilny === 'edycja' ? 'max-md:flex max-md:flex-1' : 'max-md:hidden',
          )}
        >
          <div className="hidden flex-none items-center justify-between gap-2 border-b border-line px-3 py-2 md:max-lg:flex">
            <p className="m-0 font-display text-[15px] font-bold text-foreground">Edycja</p>
            <button type="button" className={klasaPrzyciskuPaska} aria-label="Zamknij panel edycji" onClick={zamknijSzuflade}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div role="tablist" aria-label="Panele edycji" className="flex flex-none gap-1 overflow-x-auto border-b border-line px-2 pt-2">
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
                  '-mb-px min-h-11 flex-none rounded-t-[6px] border-b-2 px-2.5 py-2 text-[13px] font-medium md:min-h-0',
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
                onMotyw={(fn: (m: Motyw) => Motyw) => zmienModel((m) => ({ ...m, motyw: fn(m.motyw) }), 'motyw')}
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

      {/* Telefon: jeden panel naraz – zakładki na dole ekranu (cele dotykowe ≥ 44 px). */}
      <nav aria-label="Widok edytora" className="grid flex-none grid-cols-4 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {zakladkiMobilne.map(({ id: zid, nazwa: n, Ikona, aktywna, wybierz }) => (
          <button
            key={zid}
            type="button"
            aria-pressed={aktywna}
            onClick={wybierz}
            className={cx(
              'flex min-h-[52px] flex-col items-center justify-center gap-0.5 border-t-2 text-[12px] font-medium',
              aktywna ? 'border-data text-data-hi' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Ikona className="h-5 w-5" aria-hidden />
            {n}
          </button>
        ))}
      </nav>

      <p className="sr-only" aria-live="polite">
        {ogloszenie}
      </p>

      {pelnyEkran ? (
        <PelnyPodglad onZamknij={() => setPelnyEkran(false)}>
          <Podglad
            model={model}
            podstrona={podstrona.slug}
            pro={funkcjePro || pokazPro}
            zaznaczona={zaznaczona}
            przewinDo={null}
            urzadzenie="komputer"
            poprawny={walidacja.ok}
            pelnyRozmiar
            onWiadomosc={(w) => (w.typ === 'sekcja' ? zaznacz(w.id, false) : wiadomosc(w))}
          />
        </PelnyPodglad>
      ) : null}

      {wyborZdjecia ? (
        <WyborZdjecia
          obraz={wartoscPod(model, wyborZdjecia) as Obraz | undefined}
          sciezka={wyborZdjecia}
          stronaId={id}
          otwarty
          onWybierz={(obraz: Obraz) => {
            const seg = podzielSciezke(wyborZdjecia);
            if (seg) zmienModel((m) => ustaw(m, seg, obraz), wyborZdjecia);
            setWyborZdjecia(null);
          }}
          onZamknij={() => setWyborZdjecia(null)}
        />
      ) : null}

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

/** Widok komputera w skali 100% na całym ekranie – gdy kolumna podglądu jest za wąska na czytelną miniaturę. */
function PelnyPodglad({ children, onZamknij }: { children: ReactNode; onZamknij: () => void }) {
  const okno = useRef<HTMLDivElement>(null);
  useOknoModalne(true, onZamknij, okno);
  return (
    <div
      ref={okno}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kr-pelny-tytul"
      tabIndex={-1}
      className="fixed inset-0 z-[90] flex flex-col bg-background outline-none animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <div className="flex min-h-14 flex-none items-center gap-2 border-b border-line bg-card px-3">
        <h2 id="kr-pelny-tytul" className="m-0 min-w-0 flex-1 break-words font-display text-[15px] font-bold text-foreground">
          Podgląd – widok komputera (100%)
        </h2>
        <button type="button" className={cx(klasaPrzyciskuPaska, 'border border-line-strong px-3')} onClick={onZamknij}>
          <X className="h-4 w-4" aria-hidden /> Zamknij
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
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

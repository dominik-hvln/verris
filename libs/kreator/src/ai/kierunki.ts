import { KATALOG_EFEKTOW, KATALOG_WARIANTOW, SEKCJE_PRO } from '../katalog.ts';
import type { Strona, TypSekcji } from '../model.ts';
import { PLANY_KREATORA, type WersjaKreatora } from '../plany.ts';
import { KATALOG_STYLOW, stylPoId, type StylProjektu, type ZakresBarwy } from '../style/katalog-stylow.ts';
import type { BriefStrony, KierunekProjektu, ZiarnoKreatywne } from './kontrakt.ts';

/**
 * Wybór kierunków projektu przed generacją (serwer, nie AI). Cel: dopasowanie do branży, typu strony
 * i tonu, a jednocześnie unikalność – dwie piekarnie z tego samego miasta nie dostają tej samej strony.
 *
 *  - waga stylu = dopasowanie (branża w polu firmy i w opisie, ton, typ strony, styl wskazany w briefie)
 *    × kara za style z odcisków ostatnich stron tej branży;
 *  - kilka kierunków naraz (Pro = 3) bierze style z różnych rodzin wizualnych, różne charaktery palety
 *    i barwy odległe o ≥ 45°;
 *  - odcisk = styl|font nagłówków|wariant hero|wariant oferty – kombinacji z `odciskiNiedawne` unikamy;
 *  - losowość wstrzykiwana (`los`), więc testy są deterministyczne;
 *  - bez Kreatora Pro wyłącznie style, warianty i efekty `pro: false`.
 */

/** Deterministyczne źródło losowości z ziarna (mulberry32) – testy i powtarzalne generacje. */
export function losZZiarna(ziarno: number): () => number {
  let a = ziarno >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const indeks = (los: () => number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(los() * n)));
const wybierz = <T>(los: () => number, lista: readonly T[]): T => lista[indeks(los, lista.length)];

function wybierzWazone<T>(los: () => number, pozycje: { x: T; waga: number }[]): T {
  const suma = pozycje.reduce((s, p) => s + p.waga, 0);
  let r = los() * suma;
  for (const p of pozycje) {
    r -= p.waga;
    if (r < 0) return p.x;
  }
  return pozycje[pozycje.length - 1].x;
}

const malymi = (s: string | undefined) => (s ?? '').toLocaleLowerCase('pl-PL');

/** Odcisk kierunku – ten sam format co `odciskStrony`. */
export function odciskKierunku(k: KierunekProjektu): string {
  return [k.styl, k.fonty.naglowki.toLowerCase(), k.warianty.hero ?? '-', k.warianty.oferta ?? '-'].join('|');
}

/** Odcisk opublikowanej strony: styl, font nagłówków i warianty pierwszego hero i pierwszej oferty strony głównej. */
export function odciskStrony(strona: Strona): string {
  const glowna = strona.strony.find((p) => p.slug === '') ?? strona.strony[0];
  const sekcje = glowna?.sekcje ?? [];
  const hero = sekcje.find((s) => s.typ === 'hero')?.wariant ?? '-';
  const oferta = sekcje.find((s) => s.typ === 'oferta')?.wariant ?? '-';
  return [strona.motyw.styl, strona.motyw.fonty.naglowki.toLowerCase(), hero, oferta].join('|');
}

/** Waga stylu dla briefu (bez kary za powtórki). Eksport do testów i podglądu w panelu. */
export function wagaStylu(styl: StylProjektu, brief: BriefStrony, funkcjePro: boolean): number {
  const branza = malymi(brief.firma?.branza);
  const opis = malymi(`${brief.opis} ${brief.inspiracje ?? ''}`);
  let w = 1;
  if (branza && styl.branze.some((b) => branza.includes(b))) w += 6;
  else if (styl.branze.some((b) => opis.includes(b))) w += 3;
  const ton = malymi(brief.ton);
  if (ton && styl.tony.some((t) => ton.includes(t))) w += 2;
  if (styl.typyStron.includes(brief.typ)) w += 1.5;
  if (brief.styl) {
    const wskazany = stylPoId(brief.styl);
    const docelowy = wskazany && wskazany.pro && !funkcjePro ? wskazany.zastepczy : wskazany?.id;
    if (docelowy === styl.id) w += 25;
  }
  return w;
}

function rozpietosc([od, d]: ZakresBarwy): number {
  return od <= d ? d - od : 360 - od + d;
}

function losujBarwe(los: () => number, zakresy: readonly ZakresBarwy[]): number {
  const z = wybierz(los, zakresy);
  return Math.round(z[0] + los() * rozpietosc(z)) % 360;
}

const odlegloscBarw = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const WARIANTY_PRO = new Set(Object.values(KATALOG_WARIANTOW).flat().filter((w) => w.pro).map((w) => w.id));
const EFEKTY_PRO = new Set(KATALOG_EFEKTOW.filter((e) => e.pro).map((e) => e.id));

/** Warianty sekcji dozwolone w wersji: rekomendacje stylu, a gdy żadna nie przejdzie – pierwszy darmowy z katalogu. */
export function wariantyDlaWersji(styl: StylProjektu, funkcjePro: boolean): Partial<Record<TypSekcji, string[]>> {
  const wynik: Partial<Record<TypSekcji, string[]>> = {};
  for (const [typ, lista] of Object.entries(styl.warianty) as [TypSekcji, string[]][]) {
    if (!funkcjePro && SEKCJE_PRO.includes(typ)) continue;
    const ok = lista.filter((id) => funkcjePro || !WARIANTY_PRO.has(id));
    const zapas = KATALOG_WARIANTOW[typ].find((w) => !w.pro)?.id;
    if (ok.length) wynik[typ] = ok;
    else if (zapas) wynik[typ] = [zapas];
  }
  return wynik;
}

export function efektyDlaWersji(styl: StylProjektu, funkcjePro: boolean): string[] {
  return styl.efekty.filter((e) => funkcjePro || !EFEKTY_PRO.has(e));
}

const PROB_NA_KIERUNEK = 16;

/**
 * Ziarno kreatywne (paczka 127): kąt komunikacji, motyw przewodni i kolejność akcentów. Serwer losuje je dla każdej
 * propozycji (w Pro – różne kąty w trzech propozycjach) i wpisuje do wiadomości generacji, a nie do bloku z cache:
 * dwie firmy z tej samej branży i z tym samym stylem dostają inaczej poprowadzone teksty, a master prompt zostaje
 * bajt w bajt ten sam. Opisy są ogólne i nie dodają faktów – model wypełnia je wyłącznie treścią briefu.
 */
export interface PozycjaZiarna {
  id: string;
  opis: string;
}

export const KATY_KOMUNIKACJI: readonly PozycjaZiarna[] = [
  { id: 'sytuacja', opis: 'od sytuacji klienta – z czym przychodzi i co chce mieć z głowy; firma odpowiada na tę sytuację' },
  { id: 'sposob-pracy', opis: 'od sposobu pracy – konkretne etapy, narzędzia i kolejność działań z briefu' },
  { id: 'miejsce', opis: 'od miejsca – okolica, lokal, dojazd, rytm dnia (tylko to, co podaje brief)' },
  { id: 'efekt', opis: 'od efektu, który klient zobaczy lub poczuje – opisanego konkretnie, bez obietnic i liczb' },
  { id: 'przewidywalnosc', opis: 'od przewidywalności – cena, czas i zasady jasne z góry, bez niespodzianek' },
  { id: 'detal', opis: 'od jednego charakterystycznego szczegółu z briefu, który prowadzi przez całą stronę' },
  { id: 'relacja', opis: 'od relacji – jak wygląda rozmowa i kontakt z firmą przed, w trakcie i po usłudze' },
  { id: 'codziennosc', opis: 'od codzienności klienta – kiedy i w jakiej chwili korzysta z usługi lub produktu' },
];

export const MOTYWY_PRZEWODNIE: readonly PozycjaZiarna[] = [
  { id: 'warsztat', opis: 'warsztat i rzemiosło – słownictwo pracy rąk i narzędzi' },
  { id: 'droga', opis: 'droga – od pierwszego kroku do celu, etapy jak przystanki' },
  { id: 'rytm', opis: 'rytm i czas – pory dnia, terminy, tempo' },
  { id: 'swiatlo', opis: 'światło i jasność – przejrzystość, wyraźne zasady' },
  { id: 'rozmowa', opis: 'rozmowa – pytania, odpowiedzi, wysłuchanie' },
  { id: 'porzadek', opis: 'porządek i plan – lista, kolejność, odhaczone sprawy' },
  { id: 'dom', opis: 'dom i bliskość – swobodnie, jak u siebie' },
  { id: 'sezon', opis: 'pory roku i natura – zmiana, wzrost, świeżość' },
];

export const KOLEJNOSC_AKCENTOW: readonly PozycjaZiarna[] = [
  { id: 'oferta', opis: 'najpierw konkret oferty, potem ludzie i sposób pracy, na końcu wątpliwości' },
  { id: 'zaufanie', opis: 'najpierw kto i jak pracuje, potem oferta, na końcu działanie' },
  { id: 'proces', opis: 'najpierw jak wygląda współpraca krok po kroku, potem oferta i odpowiedzi na pytania' },
  { id: 'pytania', opis: 'najpierw odpowiedź na najczęstsze pytanie klienta (w hero lub zaraz po nim), potem oferta' },
  { id: 'miejsce', opis: 'najpierw miejsce i atmosfera, potem oferta i kontakt' },
  { id: 'dzialanie', opis: 'najpierw najprostsza droga do działania (termin, telefon, wycena), potem uzasadnienie' },
];

/** Ziarna dla kolejnych kierunków: kąty bez powtórek w jednej generacji (o ile lista wystarcza). */
function losujZiarna(los: () => number, ile: number): ZiarnoKreatywne[] {
  const katy = [...KATY_KOMUNIKACJI];
  const wynik: ZiarnoKreatywne[] = [];
  for (let i = 0; i < ile; i++) {
    const kat = katy.length ? katy.splice(indeks(los, katy.length), 1)[0] : wybierz(los, KATY_KOMUNIKACJI);
    wynik.push({ kat: kat.id, motyw: wybierz(los, MOTYWY_PRZEWODNIE).id, akcent: wybierz(los, KOLEJNOSC_AKCENTOW).id });
  }
  return wynik;
}

/**
 * Kierunki projektu dla generacji. `ile` – liczba propozycji (plan: 1 bez Pro, 3 w Pro), `wersja` –
 * wersja kreatora (domyślnie bez Pro: bezpieczniej nie dać stylu Pro niż go dać przez pomyłkę).
 */
export function wybierzKierunki(
  brief: BriefStrony,
  ile: number,
  odciskiNiedawne: string[],
  los: () => number = Math.random,
  wersja: WersjaKreatora = 'hosting',
): KierunekProjektu[] {
  const funkcjePro = PLANY_KREATORA[wersja].funkcjePro;
  const ilosc = Math.max(1, Math.min(6, Math.floor(ile)));
  const niedawne = new Set(odciskiNiedawne);
  const powtorkiStylu = new Map<string, number>();
  for (const o of odciskiNiedawne) {
    const s = o.split('|')[0];
    powtorkiStylu.set(s, (powtorkiStylu.get(s) ?? 0) + 1);
  }

  const dostepne = KATALOG_STYLOW.filter((s) => funkcjePro || !s.pro);
  const wagi = dostepne.map((s) => ({ x: s, waga: wagaStylu(s, brief, funkcjePro) * Math.max(0.1, 0.5 ** (powtorkiStylu.get(s.id) ?? 0)) }));

  const kierunki: KierunekProjektu[] = [];
  const uzyteStyle = new Set<string>();
  const uzyteRodziny = new Set<string>();
  const uzyteOdciski = new Set<string>();

  for (let i = 0; i < ilosc; i++) {
    // Najpierw style z nieużytych rodzin, potem nieużyte style, na końcu dowolne (gdy `ile` > liczby stylów).
    const nowaRodzina = wagi.filter((p) => !uzyteStyle.has(p.x.id) && !uzyteRodziny.has(p.x.rodzina));
    const nowyStyl = wagi.filter((p) => !uzyteStyle.has(p.x.id));
    const pula = nowaRodzina.length ? nowaRodzina : nowyStyl.length ? nowyStyl : wagi;
    const styl = wybierzWazone(los, pula);
    uzyteStyle.add(styl.id);
    uzyteRodziny.add(styl.rodzina);

    const warianty = wariantyDlaWersji(styl, funkcjePro);
    const charakteryWolne = styl.charaktery.filter((c) => !kierunki.some((k) => k.charakterPalety === c));
    let kierunek: KierunekProjektu | null = null;
    for (let proba = 0; proba < PROB_NA_KIERUNEK; proba++) {
      const para = wybierz(los, styl.pary);
      const barwa = losujBarwe(los, styl.barwy);
      const k: KierunekProjektu = {
        styl: styl.id,
        fonty: { naglowki: para.naglowki, tekst: para.tekst },
        barwa,
        charakterPalety: wybierz(los, charakteryWolne.length ? charakteryWolne : styl.charaktery),
        warianty: Object.fromEntries(Object.entries(warianty).map(([typ, lista]) => [typ, wybierz(los, lista)])),
        zaokraglenie: styl.zaokraglenie,
        skalaTypografii: styl.skalaTypografii,
      };
      kierunek = k;
      const odcisk = odciskKierunku(k);
      const barwaDaleko = kierunki.every((x) => odlegloscBarw(x.barwa, barwa) >= 45);
      if (!niedawne.has(odcisk) && !uzyteOdciski.has(odcisk) && (barwaDaleko || proba >= PROB_NA_KIERUNEK / 2)) break;
    }
    // kierunek jest zawsze ustawiony (co najmniej jedna próba)
    const wybrany = kierunek as KierunekProjektu;
    uzyteOdciski.add(odciskKierunku(wybrany));
    kierunki.push(wybrany);
  }
  // Ziarna losowane po wyborze wszystkich kierunków – nie zmieniają losowania stylów, fontów i barw.
  const ziarna = losujZiarna(los, kierunki.length);
  return kierunki.map((k, i) => ({ ...k, ziarno: ziarna[i] }));
}

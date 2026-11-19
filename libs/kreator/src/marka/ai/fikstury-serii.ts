import type { BriefMarki } from '../model.ts';
import { rodzinaPoId } from '../sygnety/katalog.ts';
import type { PreselekcjaMarki } from './preselekcja.ts';
import { inicjaly } from './wspolne-marki.ts';

/**
 * Paczka 134 – realistyczne odpowiedzi modelu w stylu nowego M1 (koncepcja, symbol z briefu, kompakt) dla trzech
 * briefów. Tylko testy (operacje-marki.spec.ts – odczyt, kontrola jakości, szacunek tokenów) i plansza kontrolna
 * (scratchpad marka-134). Pisane ręcznie, tak jak pisałby je model: łuki A, evenodd, biel jako wycięcie, transform.
 */

export interface FiksturaSerii {
  brief: BriefMarki;
  /** Symbole dla slotów „SYMBOL” (w kolejności), z koncepcją i uzasadnieniem. */
  symbole: { s: string; c: string; d: string }[];
  /** Koncepcje kierunków z biblioteki – po id rodziny abstrakcyjnej (monogram dostaje koncepcję z liter nazwy). */
  biblioteka: Record<string, { c: string; d: string }>;
  strategia: { g: string; c: string; s: string };
}

export const FIKSTURY_SERII: Record<'sport' | 'piekarnia' | 'rachunkowe', FiksturaSerii> = {
  sport: {
    brief: {
      nazwa: 'Lubuski Sport',
      branza: 'sport',
      opis: 'Sklep i serwis rowerowy oraz biegowy w Zielonej Górze – sprzęt, serwis i treningi.',
      rodzaj: 'znak-i-napis',
      cechy: ['energiczna', 'lokalna'],
      barwyLubiane: [],
      barwyOdrzucone: [],
    },
    symbole: [
      {
        c: 'Litera L z toru bieżni – zakręt w stopce i meta w akcencie, z nazwy Lubuski i biegania',
        s: "<path d='M20 8H36V64A10 10 0 0 0 46 74H80V90H46A26 26 0 0 1 20 64Z'/><rect x='83' y='74' width='9' height='16' fill='A'/>",
        d: 'Zakręt toru zamiast prostego kąta litery – ruch czytelny także w 16 px',
      },
      {
        c: 'Bieżnia stadionu z linią mety w akcencie – treningi biegowe z opisu, bez sylwetki biegacza',
        s: "<rect x='4' y='20' width='92' height='60' rx='30'/><rect x='19' y='35' width='62' height='30' rx='15' fill='#fff'/><rect x='58' y='20' width='9' height='15' fill='A'/>",
        d: 'Owal bieżni jako jedna mocna forma – czytelny w 16 px',
      },
      {
        c: 'Grono winorośli z Zielonej Góry ułożone z trzech kół roweru – region z nazwy i serwis rowerowy',
        s: "<circle cx='33' cy='40' r='17'/><circle cx='67' cy='40' r='17'/><circle cx='50' cy='70' r='17'/><path fill='A' d='M46 4H54V22H46Z'/>",
        d: 'Trzy koła jako grono – skojarzenie z Lubuskiem bez dosłownego liścia',
      },
      {
        c: 'Litera S słowa Sport wycięta w kafelku jak ścieżka – szyld sklepu i ślad trasy',
        s: "<rect x='6' y='6' width='88' height='88' rx='16'/><path fill='#fff' d='M50 16A18 18 0 0 0 50 52V41A7 7 0 0 1 50 27Z'/><path fill='#fff' d='M50 48A18 18 0 0 1 50 84V73A7 7 0 0 0 50 59Z'/><rect fill='#fff' x='50' y='16' width='20' height='11'/><rect fill='#fff' x='30' y='73' width='20' height='11'/>",
        d: 'Przestrzeń negatywna daje literę i drogę naraz – mocna plama na szyldzie',
      },
    ],
    biblioteka: {
      strzalka: { c: 'Szewron jako kierunek i tempo – ruch na rowerze i w biegu z briefu', d: 'Forma z biblioteki pasująca do sportu' },
      gory: { c: 'Szczyt jako cel treningu – outdoor i trasy wokół Zielonej Góry z briefu', d: 'Forma z biblioteki pasująca do sportu i tras' },
    },
    strategia: { g: 'Rowerzyści i biegacze z Zielonej Góry', c: 'ruch na co dzień', s: 'tor i trasa' },
  },
  piekarnia: {
    brief: {
      nazwa: 'Złoty Kłos',
      branza: 'piekarnia',
      opis: 'Rodzinna piekarnia w Poznaniu – chleb na zakwasie i drożdżówki, wypiek codziennie od 5 rano.',
      rodzaj: 'znak-i-napis',
      cechy: ['rzemieslnicza', 'ciepla'],
      barwyLubiane: [],
      barwyOdrzucone: [],
    },
    symbole: [
      {
        c: 'Złocisty bochenek z nacięciem w kształcie litery Z – Złoty Kłos i chleb na zakwasie',
        s: "<ellipse cx='50' cy='54' rx='45' ry='34' fill='A'/><path fill='#fff' d='M28 36H72V46L46 64H72V74H28V64L54 46H28Z'/>",
        d: 'Nacięcie bochenka niesie inicjał – rzemiosło bez kłosa',
      },
      {
        c: 'Wschód słońca nad bochenkiem – wypiek codziennie od 5 rano z opisu',
        s: "<path fill='A' d='M20 58A30 30 0 0 1 80 58Z'/><rect x='46' y='8' width='8' height='14' rx='4' fill='A'/><rect x='8' y='64' width='84' height='16' rx='8'/>",
        d: 'Półkole nad linią – poranek i ciepło, prosta sylwetka',
      },
      {
        c: 'Litera K z ziaren kłosa – inicjał nazwy, ramiona jak dwa ziarna',
        s: "<rect x='20' y='8' width='16' height='84' rx='4'/><ellipse cx='60' cy='30' rx='11' ry='24' transform='rotate(40 60 30)' fill='A'/><ellipse cx='60' cy='70' rx='11' ry='24' transform='rotate(-40 60 70)'/>",
        d: 'Ziarno zamiast całego kłosa – motyw przetworzony w literę',
      },
      {
        c: 'Litery Z i K nazwy na wspólnej linii – szyld piekarni czytelny z ulicy',
        s: "<path d='M6 16H44V28L22 72H44V84H6V72L28 28H6Z'/><path fill='A' d='M52 16H64V44L80 16H94L74 50L94 84H80L64 56V84H52Z'/>",
        d: 'Dwie litery o tej samej grubości – porządek i rzemiosło',
      },
    ],
    biblioteka: {
      promienie: { c: 'Wschodzące słońce – poranny wypiek od 5 rano z opisu', d: 'Forma z biblioteki pasująca do piekarni' },
      'luk-okno': { c: 'Łuk pieca chlebowego jako brama – piec i wypiek z briefu', d: 'Forma z biblioteki pasująca do piekarni' },
      petla: { c: 'Węzeł jak splot chałki – rzemiosło piekarza z briefu', d: 'Forma z biblioteki pasująca do rzemiosła' },
    },
    strategia: { g: 'Mieszkańcy Poznania na co dzień', c: 'świeżość od rana', s: 'zakwas i poranny wypiek' },
  },
  rachunkowe: {
    brief: {
      nazwa: 'Bilans',
      podpis: 'Biuro rachunkowe',
      branza: 'biuro rachunkowe',
      opis: 'Pełna księgowość i kadry dla małych firm w Gnieźnie, rozliczenia zawsze do 10. dnia miesiąca.',
      rodzaj: 'znak-i-napis',
      cechy: ['ekspercka', 'spokojna'],
      barwyLubiane: [],
      barwyOdrzucone: [],
    },
    symbole: [
      {
        c: 'Litera B z dwóch równych brzuśców – winien i ma w równowadze, bilans z nazwy',
        s: "<path fill-rule='evenodd' d='M18 8H54A21 21 0 0 1 54 50H18ZM32 20V38H52A9 9 0 0 0 52 20Z'/><path fill='A' fill-rule='evenodd' d='M18 50H54A21 21 0 0 1 54 92H18ZM32 62V80H52A9 9 0 0 0 52 62Z'/>",
        d: 'Dwie równe części jednej litery – równowaga bez wagi szalkowej',
      },
      {
        c: 'Cztery pola księgi, jedno domknięte akcentem – rozliczenie do 10. dnia miesiąca',
        s: "<rect x='8' y='8' width='38' height='38' rx='5'/><rect x='54' y='8' width='38' height='38' rx='5'/><rect x='8' y='54' width='38' height='38' rx='5'/><rect x='54' y='54' width='38' height='38' rx='5' fill='A'/>",
        d: 'Siatka księgi z jednym zamkniętym polem – porządek i termin',
      },
      {
        c: 'Dwie równe kolumny na wspólnej podstawie – aktywa i pasywa bilansu',
        s: "<rect x='16' y='10' width='28' height='64' rx='3'/><rect x='56' y='10' width='28' height='64' rx='3'/><rect x='8' y='80' width='84' height='12' rx='2' fill='A'/>",
        d: 'Równe masy na jednej linii – spokój i kontrola',
      },
      {
        c: 'Inicjał B wycięty w kwadracie jak pieczęć biura – dokumenty w porządku',
        s: "<rect x='6' y='6' width='88' height='88' rx='10'/><path fill='#fff' fill-rule='evenodd' d='M28 18H56A16 16 0 0 1 56 50H28ZM39 28V40H54A6 6 0 0 0 54 28Z'/><path fill='#fff' fill-rule='evenodd' d='M28 50H58A16 16 0 0 1 58 82H28ZM39 60V72H56A6 6 0 0 0 56 60Z'/>",
        d: 'Pieczęć z literą – urzędowa powaga bez ozdobników',
      },
    ],
    biblioteka: {
      krysztal: { c: 'Faseta kryształu jak precyzja liczb – finanse z briefu', d: 'Forma z biblioteki pasująca do finansów' },
    },
    strategia: { g: 'Właściciele małych firm z Gniezna', c: 'spokój terminów', s: 'równowaga winien–ma' },
  },
};

/** Odpowiedź serii jak od modelu: symbole w slotach „SYMBOL”, w pozostałych pierwsza rodzina slotu i krój slotu. */
export function odpowiedzFikstury(f: FiksturaSerii, p: PreselekcjaMarki): string {
  let nrS = 0;
  const k = p.sloty.map((s, i) => {
    const w: Record<string, unknown> = {};
    const barwa = (s.barwy[0] + 10) % 360;
    if (s.symbolAi) {
      const sym = f.symbole[nrS++ % f.symbole.length];
      Object.assign(w, { c: sym.c, s: sym.s });
      w.d = sym.d;
    } else {
      const id = s.rodziny[0]?.id ?? '';
      const b = f.biblioteka[id] ?? { c: `Monogram ${inicjaly(f.brief.nazwa)} z liter nazwy – zwarta ikona na szyld i favicon`, d: 'Inicjały nazwy w jednym kształcie' };
      w.c = rodzinaPoId(id)?.monogram ? `Monogram ${inicjaly(f.brief.nazwa)} z liter nazwy – zwarta ikona na szyld i favicon` : b.c;
      if (id) w.r = id;
      w.d = b.d;
    }
    Object.assign(w, { f: s.kroje?.[0] ?? 'Archivo', b: barwa, ch: s.charaktery[0] });
    if (i % 2) Object.assign(w, { n: 'wersaliki', ro: 80 });
    return w;
  });
  return JSON.stringify({ st: f.strategia, k });
}

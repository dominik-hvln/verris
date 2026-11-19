import type { BriefMarki } from '../model.ts';

/**
 * Blokada naśladowania cudzych marek (koncepcja 2.3 i 2.6): kreator nie projektuje znaków „jak logo X” ani dla
 * nazwy znanej marki. Sprawdzenie przed wywołaniem AI (brief, polecenia zmian, polecenia KV i odświeżenia) –
 * tanie, deterministyczne, z komunikatem po polsku. To nie jest badanie znaków towarowych (to robi klient w TMview),
 * tylko zapora na oczywiste przypadki.
 *
 * Dwie listy:
 *  - MARKI_JEDNOZNACZNE – nazwy, które w języku polskim nie są zwykłymi słowami: w nazwie firmy blokują zawsze,
 *    w opisie i poleceniu – gdy stoją przy słowie naśladowania („jak”, „w stylu”, „podobne do”…);
 *  - MARKI_WIELOZNACZNE – nazwy będące zwykłymi słowami („Puma”, „Orange”, „Żabka”, „Bolt”): blokują tylko jako
 *    cała nazwa firmy albo przy słowie naśladowania (piekarnia „Biedronka i Pszczoła” przechodzi).
 * Do tego wzorzec ogólny „jak logo firmy/konkurencji/…” – naśladowanie znaku bez podania nazwy.
 * Lista jest celowo krótka i aktualizowana w kodzie (marki znane w Polsce i globalnie).
 */

export const MARKI_JEDNOZNACZNE: readonly string[] = [
  'Nike', 'Adidas', 'Reebok', 'New Balance', 'Under Armour', 'Asics', 'Converse', 'Lacoste', 'Ralph Lauren',
  'Tommy Hilfiger', 'Calvin Klein', 'Hugo Boss', 'Levis', "Levi's", 'The North Face', 'Patagonia', 'Chanel', 'Gucci',
  'Louis Vuitton', 'Dior', 'Prada', 'Hermes', 'Versace', 'Armani', 'Burberry', 'Balenciaga', 'Rolex', 'Cartier',
  'Swarovski', 'H&M', 'Sinsay', 'Cropp', 'Mohito', 'Pepco', 'Sephora',
  'Rossmann', 'W.Kruk', 'Vistula', 'Wolczanka',
  'Coca-Cola', 'Pepsi', 'Red Bull', 'Monster Energy', 'Heineken', 'Carlsberg', 'Tyskie', 'Zywiec', 
  'Starbucks', "McDonald's", 'McDonalds', 'KFC', 'Burger King', 'Subway', 'Pizza Hut', "Domino's", 'Telepizza',
  'Costa Coffee', 'Nestle', 'Danone', 'Milka', 'Wedel', 'Haribo', 'Lindt', 'Nutella',
  'iPhone', 'Google', 'Microsoft', 'Amazon', 'Facebook', 'Instagram', 'WhatsApp', 
  'YouTube', 'TikTok', 'LinkedIn', 'Twitter', 'Snapchat', 'Pinterest', 'Netflix', 'Spotify', 'Disney', 'Pixar',
  'Marvel', 'Lego', 'Samsung', 'Sony', 'PlayStation', 'Xbox', 'Nintendo', 'Intel', 'Nvidia', 'IBM', 'Oracle',
  'Adobe', 'Canva', 'Shopify', 'Wix', 'Airbnb', 'Uber', 'Booking.com', 'PayPal', 'Mastercard', 'American Express',
  'Revolut', 'BLIK', 'OLX', 'InPost', 'Paczkomat', 'Empik', 'Media Markt', 'MediaExpert', 'Media Expert',
  'RTV Euro AGD', 'IKEA', 'Leroy Merlin', 'Castorama', 'Decathlon', 'Lidl', 'Kaufland', 'Carrefour', 'Auchan',
  'Stokrotka', 'Orlen', 'PKN Orlen', 'Circle K', 'Shell', 'PKO BP', 'mBank', 'Santander',
  'Pekao', 'ING', 'Alior', 'Credit Agricole', 'T-Mobile', 'Plus GSM', 'Polsat', 'TVN', 'Onet',
  'Wirtualna Polska', 'Interia', 'Poczta Polska', 'PKP', 'PKP Intercity', 'Ryanair', 'Wizz Air', 'Lufthansa',
  'DHL', 'UPS', 'FedEx', 'DPD', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Toyota',
  'Ferrari', 'Porsche', 'Lamborghini', 'Maserati', 'Harley-Davidson', 'Skoda', 'Renault', 'Peugeot', 'Citroen',
  'Hyundai', 'Lexus', 'Volvo', 'Michelin', 'Playboy', 'FIFA', 'UEFA', 'NBA',
];

export const MARKI_WIELOZNACZNE: readonly string[] = [
  'Puma', 'Orange', 'Play', 'Plus', 'Bolt', 'Zabka', 'Biedronka', 'Jaguar', 'Mustang', 'Fiat', 'Opel', 'Ford',
  'Honda', 'Mazda', 'Kia', 'Seat', 'Jeep', 'Mini', 'Dove', 'Vans', 'Fila', 'Kappa', 'Visa', 'Action', 'Hebe', 'Mango',
  'Columbia', 'Monster', 'Corona', 'Camel', 'Lotus', 'Diesel', 'Guess', 'Gap', 'Oral-B', 'Axe', 'Pampers',
  'Apple', 'Windows', 'Messenger', 'Millennium', 'Kinder', 'Lech', 'Douglas', 'Pandora', 'Zara', 'Lotos', 'Allegro', 'Tiffany', 'Mercedes', 'Reserved', 'Tesla', 'LOT', 'Dino', 'Netto', 'Apart',
];

/** Słowa naśladowania (po normalizacji, bez polskich znaków) – 0–3 słowa przed nazwą marki. */
const NASLADOWANIE = /^(jak|jakie|jaki|jaka|jakim|jakby|podobn\w*|styl|stylu|stylem|wzor|wzorem|wzorowan\w*|inspir\w*|a la|ala|przypomina\w*|skopiuj\w*|kopi\w*|nasladu\w*|imitu\w*|klon\w*|zrzyna\w*|identyczn\w*|taki sam|taka sama|takie samo)$/;

/** Ogólne „jak logo firmy/konkurencji/…” – naśladowanie znaku bez nazwy. */
const NASLADOWANIE_OGOLNE =
  /\b(?:jak|podobn\w* do|w stylu|na wzor|wzorowan\w* na|a la|skopiuj\w*|kopi\w*|nasladu\w*|identyczn\w* jak)\s+(?:to\s+|u\s+)?(?:logo|logotyp\w*|znak\w*|sygnet\w*)\s+(?:firmy|marki|konkurencji|sieci|producenta|sklepu|banku)\b/;

/** Normalizacja do porównań: małe litery, bez polskich znaków i akcentów, interpunkcja → spacja. */
export function normalizujNazwe(tekst: string): string {
  return tekst
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[&]/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

interface WzorMarki {
  marka: string;
  /** Warianty znormalizowane: „coca cola”, „cocacola”. */
  warianty: string[];
  jednoznaczna: boolean;
}

const WZORY: WzorMarki[] = [
  ...MARKI_JEDNOZNACZNE.map((m) => ({ m, j: true })),
  ...MARKI_WIELOZNACZNE.map((m) => ({ m, j: false })),
].map(({ m, j }) => {
  const n = normalizujNazwe(m.replace(/&/g, ''));
  return { marka: m, warianty: [...new Set([n, n.replace(/ /g, '')])].filter((x) => x.length >= 2), jednoznaczna: j };
});

/** Rdzeń jednowyrazowej marki do form odmienionych („żabka” → „zabk”: „Żabki”, „Żabką”); krótsze niż 5 liter – bez rdzenia („zara” ≠ „zaraz”). */
const rdzen = (w: string) => (w.length >= 5 && !w.includes(' ') ? w.replace(/[aeiouy]$/, '') : null);

/**
 * Wystąpienia marek w tekście (znormalizowanym): marka i indeks słowa, od którego się zaczyna. `odmiana` – także
 * formy odmienione marek jednowyrazowych (rdzeń + do 3 liter) – tylko przy sprawdzaniu naśladowania.
 */
function wystapienia(slowa: string[], odmiana = false): { wzor: WzorMarki; od: number }[] {
  const wynik: { wzor: WzorMarki; od: number }[] = [];
  for (const wzor of WZORY) {
    for (const w of wzor.warianty) {
      const czesci = w.split(' ');
      const r = odmiana ? rdzen(w) : null;
      for (let i = 0; i + czesci.length <= slowa.length; i++) {
        const dokladnie = czesci.every((c, j) => slowa[i + j] === c);
        const odmienione = r !== null && slowa[i].startsWith(r) && slowa[i].length <= w.length + 3;
        if (dokladnie || odmienione) wynik.push({ wzor, od: i });
      }
    }
  }
  return wynik;
}

export interface UwagaBriefu {
  /** Pole briefu albo 'polecenie'. */
  pole: string;
  komunikat: string;
  marka?: string;
}

export interface WynikSprawdzeniaMarki {
  ok: boolean;
  bledy: UwagaBriefu[];
}

const komunikatNazwy = (m: string) =>
  `„${m}” to nazwa znanej marki. Kreator marki nie projektuje znaków dla cudzych marek – wpisz nazwę swojej firmy.`;
const komunikatNasladowania = (m: string) =>
  `Kreator marki nie projektuje znaków na wzór cudzych marek („jak ${m}”, „w stylu ${m}”). Opisz słowami, co ma wyrażać Twój znak – np. ruch, lekkość, rzemiosło, spokój.`;
const KOMUNIKAT_OGOLNY =
  'Kreator marki nie kopiuje cudzych znaków („jak logo firmy…”). Opisz słowami, co ma wyrażać Twój znak – np. ruch, lekkość, rzemiosło, spokój.';

/** Sprawdzenie jednego tekstu (opis, uwagi, polecenie) – naśladowanie marki albo cudzego logo. */
export function sprawdzTekstMarki(tekst: string | undefined, pole: string): UwagaBriefu[] {
  if (!tekst?.trim()) return [];
  const norm = normalizujNazwe(tekst);
  const slowa = norm.split(' ');
  const bledy: UwagaBriefu[] = [];
  for (const { wzor, od } of wystapienia(slowa, true)) {
    const przed = slowa.slice(Math.max(0, od - 3), od);
    // „a la” to dwa słowa – sprawdzamy też pary.
    const pary = przed.map((s, i) => (i + 1 < przed.length ? `${s} ${przed[i + 1]}` : s));
    if ([...przed, ...pary].some((s) => NASLADOWANIE.test(s)) || /\blogo\b/.test(przed.join(' '))) {
      if (!bledy.some((b) => b.marka === wzor.marka)) bledy.push({ pole, komunikat: komunikatNasladowania(wzor.marka), marka: wzor.marka });
    }
  }
  if (!bledy.length && NASLADOWANIE_OGOLNE.test(norm)) bledy.push({ pole, komunikat: KOMUNIKAT_OGOLNY });
  return bledy;
}

/** Nazwa firmy (i podpis): marka jednoznaczna jako słowo w nazwie albo dowolna marka jako cała nazwa. */
export function sprawdzNazweMarki(nazwa: string | undefined, pole = 'nazwa'): UwagaBriefu[] {
  if (!nazwa?.trim()) return [];
  const norm = normalizujNazwe(nazwa);
  const slowa = norm.split(' ');
  const bledy: UwagaBriefu[] = [];
  for (const { wzor } of wystapienia(slowa)) {
    const calosc = wzor.warianty.includes(norm) || wzor.warianty.includes(norm.replace(/ /g, ''));
    if ((wzor.jednoznaczna || calosc) && !bledy.some((b) => b.marka === wzor.marka)) {
      bledy.push({ pole, komunikat: komunikatNazwy(wzor.marka), marka: wzor.marka });
    }
  }
  // Nazwa zlepiona („cocacolashop”) – tylko marki jednoznaczne, co najmniej 5 znaków (bez fałszywych trafień „lot”, „ing”).
  if (!bledy.length) {
    const zlepiona = norm.replace(/ /g, '');
    const w = WZORY.find((x) => x.jednoznaczna && x.warianty.some((v) => v.replace(/ /g, '').length >= 5 && zlepiona.includes(v.replace(/ /g, ''))));
    if (w) bledy.push({ pole, komunikat: komunikatNazwy(w.marka), marka: w.marka });
  }
  return bledy;
}

/** Brief „Nowa marka”: nazwa, podpis, opis i uwagi. Wynik `ok: false` = nie wywołujemy AI, pokazujemy komunikaty. */
export function sprawdzBriefMarki(brief: Pick<BriefMarki, 'nazwa' | 'opis'> & Partial<Pick<BriefMarki, 'podpis' | 'uwagi' | 'branza'>>): WynikSprawdzeniaMarki {
  const bledy = [
    ...sprawdzNazweMarki(brief.nazwa, 'nazwa'),
    ...sprawdzTekstMarki(brief.podpis, 'podpis'),
    ...sprawdzTekstMarki(brief.opis, 'opis'),
    ...sprawdzTekstMarki(brief.uwagi, 'uwagi'),
  ];
  return { ok: bledy.length === 0, bledy };
}

/** Polecenie (zmiana, KV, odświeżenie, hasło) – naśladowanie marki albo cudzego logo. */
export function sprawdzPolecenieMarki(polecenie: string | undefined): WynikSprawdzeniaMarki {
  const bledy = sprawdzTekstMarki(polecenie, 'polecenie');
  return { ok: bledy.length === 0, bledy };
}

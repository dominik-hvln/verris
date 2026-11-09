import { z } from 'zod';
import { JEZYKI, JEZYKI_DODATKOWE, jezykPodstrony, kluczPodstrony, prefiksJezyka, slugGlownej } from './jezyki.ts';

/**
 * Model strony kreatora Verris – jedno źródło prawdy dla AI (wynik generacji), edytora (panel klienta)
 * i rendererów (statyczny HTML teraz, bloki WordPressa w etapie 3). AI nigdy nie pisze HTML ani JS:
 * składa stronę z tego modelu i katalogów (style, warianty sekcji, efekty), a renderer zamienia ją na kod.
 * Dzięki temu każda strona jest bezpieczna, szybka i poprawna (SEO, dostępność), a unikalność
 * daje kombinacja stylu, palety, fontów, wariantów układu i treści.
 *
 * Zmiana kształtu modelu = podbicie WERSJA_MODELU i migracja w `migrujModel` (stare strony w bazie).
 */
export const WERSJA_MODELU = 1;

const tekst = (max: number) => z.string().trim().min(1).max(max);
const tekstOpc = (max: number) => z.string().trim().max(max).optional();

/** Bezpieczny cel linku: kotwica, ścieżka względna, https, tel:, mailto:. Bez javascript:, data: itd. */
export const CelLinku = z
  .string()
  .trim()
  .max(500)
  .regex(/^(#[a-z0-9-]{1,60}|\/[^\s]*|https:\/\/[^\s]+|tel:\+?[0-9 ]{3,20}|mailto:[^\s@]+@[^\s@]+)$/i, 'Niedozwolony adres linku');

export const Przycisk = z.object({
  etykieta: tekst(40),
  cel: CelLinku,
  styl: z.enum(['glowny', 'drugi']).default('glowny'),
});
export type Przycisk = z.infer<typeof Przycisk>;

/**
 * Obraz. `placeholder` = renderer rysuje elegancką ramkę z palety (kształt z SVG) i podpis, co w nią wstawić.
 * `wlasne` / `pixabay` / `openverse` / `pexels` / `ai` = plik skopiowany na hosting klienta (nigdy hotlink).
 * Paczka 122: zdjęcie z biblioteki konta wskazuje `zasobId` (KreatorZasob w magazynie Verris) – renderer składa
 * <picture> z wariantów webp/jpg przez `OpcjeRenderu.adresZasobu`; `url` zostaje dla obrazów sprzed biblioteki.
 */
export const Obraz = z.object({
  alt: z.string().trim().max(200),
  zrodlo: z.enum(['placeholder', 'pexels', 'ai', 'wlasne', 'pixabay', 'openverse']).default('placeholder'),
  /** Zdjęcie w bibliotece konta (KreatorZasob); serwer sprawdza przy zapisie, że należy do konta strony. */
  zasobId: z.uuid().optional(),
  /** Punkt, który zostaje w kadrze przy przycinaniu (0..1 od lewej/góry) → object-position. */
  ogniskowa: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  /** Wymiary oryginału w px (z biblioteki) – renderer wybiera z nich szerokości wariantów. */
  szerokosc: z.number().int().min(1).max(20000).optional(),
  wysokosc: z.number().int().min(1).max(20000).optional(),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^(\/|assets\/|https:\/\/)/, 'Adres obrazu musi być względny albo https')
    .optional(),
  /** Fraza do wyszukania zdjęcia w bibliotece (po angielsku) albo opis do wygenerowania. */
  opisDoWyszukania: tekstOpc(200),
  /** Podpis widoczny na placeholderze, np. „Zdjęcie: wnętrze salonu”. */
  podpis: tekstOpc(120),
  autor: tekstOpc(120),
  /** Kod licencji ('cc0', 'pdm', 'pixabay', 'pexels', 'cc-by', …) – podpis autora tylko, gdy licencja go wymaga. */
  licencja: z.string().trim().max(40).regex(/^[a-z0-9.-]*$/).optional(),
  licencjaUrl: z.string().trim().max(500).optional(),
  proporcje: z.enum(['16:9', '4:3', '3:2', '1:1', '3:4', '4:5']).default('4:3'),
});
export type Obraz = z.infer<typeof Obraz>;

export const POZIOMY_ANIMACJI = ['brak', 'subtelne', 'wyraziste'] as const;
export const TLA_SEKCJI = ['domyslne', 'powierzchnia', 'ciemne', 'akcent'] as const;

const bazaSekcji = {
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  /** Identyfikator wariantu układu z KATALOG_WARIANTOW[typ] (np. 'hero-podzielony'). */
  wariant: z.string().regex(/^[a-z0-9-]{1,40}$/),
  tlo: z.enum(TLA_SEKCJI).default('domyslne'),
  /** Kotwica w nawigacji; brak = sekcja poza menu. */
  wMenu: tekstOpc(30),
  ukryta: z.boolean().default(false),
};

const Hero = z.object({
  ...bazaSekcji,
  typ: z.literal('hero'),
  dane: z.object({
    nadtytul: tekstOpc(80),
    naglowek: tekst(140),
    /** Fragment nagłówka do wyróżnienia (kursywa/kolor akcentu) – musi występować w nagłówku. */
    wyroznienie: tekstOpc(60),
    podtytul: tekstOpc(320),
    przyciski: z.array(Przycisk).max(2).default([]),
    obraz: Obraz.optional(),
    /** Krótkie fakty obok (np. godziny otwarcia, „Wycena w 24 h”) – bez zmyślonych liczb. */
    fakty: z.array(z.object({ etykieta: tekst(40), wartosc: tekst(80) })).max(4).default([]),
  }),
});

const Oferta = z.object({
  ...bazaSekcji,
  typ: z.literal('oferta'),
  dane: z.object({
    naglowek: tekst(120),
    wstep: tekstOpc(400),
    pozycje: z
      .array(
        z.object({
          tytul: tekst(80),
          opis: tekstOpc(300),
          /** Cena podana przez klienta, tekstem („od 90 zł”). AI nie wymyśla cen – zostawia puste. */
          cena: tekstOpc(40),
          ikona: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
        }),
      )
      .min(1)
      .max(16),
  }),
});

const Cennik = z.object({
  ...bazaSekcji,
  typ: z.literal('cennik'),
  dane: z.object({
    naglowek: tekst(120),
    wstep: tekstOpc(400),
    pakiety: z
      .array(
        z.object({
          nazwa: tekst(60),
          opis: tekstOpc(200),
          /** Kwoty w złotych, brutto obowiązkowo; netto gdy klient jest firmą B2B. null = „wycena indywidualna”. */
          cenaBrutto: z.number().nonnegative().max(1_000_000).nullable(),
          cenaNetto: z.number().nonnegative().max(1_000_000).optional(),
          okres: z.enum(['jednorazowo', 'miesiac', 'rok', 'od']).default('jednorazowo'),
          cechy: z.array(tekst(120)).max(12).default([]),
          wyrozniony: z.boolean().default(false),
          przycisk: Przycisk.optional(),
        }),
      )
      .min(1)
      .max(6),
    uwaga: tekstOpc(300),
  }),
});

const Galeria = z.object({
  ...bazaSekcji,
  typ: z.literal('galeria'),
  dane: z.object({ naglowek: tekst(120), wstep: tekstOpc(300), obrazy: z.array(Obraz).min(1).max(24) }),
});

const Zespol = z.object({
  ...bazaSekcji,
  typ: z.literal('zespol'),
  dane: z.object({
    naglowek: tekst(120),
    wstep: tekstOpc(300),
    osoby: z.array(z.object({ imie: tekst(60), rola: tekstOpc(80), opis: tekstOpc(300), obraz: Obraz.optional() })).min(1).max(12),
  }),
});

/**
 * Opinie wpisuje wyłącznie klient (albo import z jego wizytówki). AI zostawia `wpisy: []` – walidator
 * `sprawdzZasadyTresci` odrzuca generację z wpisami. Pusta sekcja: w edytorze placeholder, na stronie znika.
 */
const Opinie = z.object({
  ...bazaSekcji,
  typ: z.literal('opinie'),
  dane: z.object({
    naglowek: tekst(120),
    zrodlo: z.enum(['reczne', 'google']).default('reczne'),
    wpisy: z.array(z.object({ autor: tekst(80), tresc: tekst(600), data: tekstOpc(20), zrodloUrl: z.string().max(500).optional() })).max(20).default([]),
  }),
});

const Faq = z.object({
  ...bazaSekcji,
  typ: z.literal('faq'),
  dane: z.object({ naglowek: tekst(120), pytania: z.array(z.object({ pytanie: tekst(200), odpowiedz: tekst(1200) })).min(1).max(16) }),
});

const Kroki = z.object({
  ...bazaSekcji,
  typ: z.literal('kroki'),
  dane: z.object({
    naglowek: tekst(120),
    wstep: tekstOpc(300),
    kroki: z.array(z.object({ tytul: tekst(80), opis: tekstOpc(300), czas: tekstOpc(40) })).min(2).max(8),
  }),
});

const ONas = z.object({
  ...bazaSekcji,
  typ: z.literal('onas'),
  dane: z.object({
    naglowek: tekst(120),
    akapity: z.array(tekst(900)).min(1).max(6),
    obraz: Obraz.optional(),
    wyrozniki: z.array(z.object({ tytul: tekst(80), opis: tekstOpc(240) })).max(6).default([]),
  }),
});

export const POLA_FORMULARZA = ['imie', 'email', 'telefon', 'wiadomosc', 'termin', 'usluga', 'firma'] as const;

const Kontakt = z.object({
  ...bazaSekcji,
  typ: z.literal('kontakt'),
  dane: z.object({
    naglowek: tekst(120),
    wstep: tekstOpc(300),
    formularz: z.boolean().default(true),
    pola: z.array(z.enum(POLA_FORMULARZA)).max(7).default(['imie', 'email', 'wiadomosc']),
    /** Mapa jako statyczny placeholder z linkiem do map (bez osadzania trackerów przed zgodą). */
    mapa: z.boolean().default(true),
  }),
});

const Cta = z.object({
  ...bazaSekcji,
  typ: z.literal('cta'),
  dane: z.object({ naglowek: tekst(140), tekst: tekstOpc(300), przyciski: z.array(Przycisk).min(1).max(2) }),
});

/** Kreator Pro – katalog z płatnością (etap 2). */
const Produkty = z.object({
  ...bazaSekcji,
  typ: z.literal('produkty'),
  dane: z.object({
    naglowek: tekst(120),
    wstep: tekstOpc(300),
    produkty: z
      .array(
        z.object({
          nazwa: tekst(100),
          opis: tekstOpc(400),
          cenaBrutto: z.number().nonnegative().max(1_000_000),
          obraz: Obraz.optional(),
          dostepnosc: z.enum(['dostepny', 'ostatnie', 'niedostepny', 'na-zamowienie']).default('dostepny'),
          sku: z.string().max(60).optional(),
        }),
      )
      .min(1)
      .max(48),
  }),
});

/** Kreator Pro – blog. Wpisy żyją jako podstrony `blog/<slug>`; tu zajawki. */
const Blog = z.object({
  ...bazaSekcji,
  typ: z.literal('blog'),
  dane: z.object({
    naglowek: tekst(120),
    wpisy: z
      .array(
        z.object({
          tytul: tekst(140),
          lead: tekst(400),
          data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          czasCzytania: z.number().int().min(1).max(120).optional(),
          slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
          obraz: Obraz.optional(),
        }),
      )
      .max(30)
      .default([]),
  }),
});

export const Sekcja = z.discriminatedUnion('typ', [Hero, Oferta, Cennik, Galeria, Zespol, Opinie, Faq, Kroki, ONas, Kontakt, Cta, Produkty, Blog]);
export type Sekcja = z.infer<typeof Sekcja>;
export type TypSekcji = Sekcja['typ'];
export type SekcjaTypu<T extends TypSekcji> = Extract<Sekcja, { typ: T }>;
export const TYPY_SEKCJI: TypSekcji[] = ['hero', 'oferta', 'cennik', 'galeria', 'zespol', 'opinie', 'faq', 'kroki', 'onas', 'kontakt', 'cta', 'produkty', 'blog'];

const Kolor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Paleta semantyczna; renderer pilnuje kontrastu (WCAG AA) i w razie potrzeby przyciemnia/rozjaśnia tekst. */
export const Paleta = z.object({
  tlo: Kolor,
  powierzchnia: Kolor,
  tekst: Kolor,
  tekstPrzygaszony: Kolor,
  akcent: Kolor,
  /** Tekst na tle akcentu (przyciski). */
  naAkcencie: Kolor,
  /** Wariant akcentu do tekstu na jasnym tle, gdy sam akcent ma za mały kontrast. */
  akcentTekst: Kolor,
  linia: Kolor,
  ciemne: Kolor,
  naCiemnym: Kolor,
});
export type Paleta = z.infer<typeof Paleta>;

export const Motyw = z.object({
  /** Identyfikator kierunku z KATALOG_STYLOW. */
  styl: z.string().regex(/^[a-z0-9-]{1,40}$/),
  paleta: Paleta,
  /** Rodziny z katalogu fontów (Google Fonts, kopiowane na hosting klienta). */
  fonty: z.object({ naglowki: tekst(60), tekst: tekst(60), akcent: tekstOpc(60) }),
  zaokraglenie: z.enum(['ostre', 'lekkie', 'miekkie', 'pelne']).default('lekkie'),
  gestosc: z.enum(['zwarta', 'normalna', 'przestronna']).default('normalna'),
  skalaTypografii: z.enum(['spokojna', 'wyrazista', 'monumentalna']).default('wyrazista'),
  animacje: z.enum(POZIOMY_ANIMACJI).default('subtelne'),
  /** Identyfikatory z KATALOG_EFEKTOW (moduły JS/CSS renderera). */
  efekty: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(12).default([]),
});
export type Motyw = z.infer<typeof Motyw>;

/** Adres podstrony bez prefiksu języka: '' (główna), 'o-nas', 'blog/wpis'. */
const SLUG_BEZ_JEZYKA = /^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60})?)?$/;

export const Podstrona = z.object({
  /**
   * '' = strona główna. Wersje językowe (paczka 124): prefiks języka – 'en' (główna angielska), 'en/oferta',
   * 'en/blog/wpis' (trzy człony tylko z prefiksem języka – pilnuje sprawdzSpojnosc).
   */
  slug: z.string().regex(/^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60}){0,2})?$/),
  /** Język podstrony; brak = z prefiksu adresu (język z `jezykiDodatkowe`), inaczej język strony (jezyki.ts). */
  jezyk: z.enum(JEZYKI).optional(),
  /** Wspólny identyfikator tłumaczeń tej samej podstrony; brak = adres bez prefiksu języka. */
  klucz: z.string().regex(SLUG_BEZ_JEZYKA).optional(),
  tytul: tekst(80),
  seo: z.object({ tytul: tekstOpc(70), opis: tekstOpc(170) }).default({}),
  sekcje: z.array(Sekcja).min(1).max(30),
  /** Tłumaczenie: skrót treści oryginału w chwili tłumaczenia (`skrotTresci`) – inny skrót = tłumaczenie nieaktualne. */
  tlumaczenie: z.object({ zrodlo: z.string().regex(/^[0-9a-f]{16}$/), data: z.string().max(40).optional() }).optional(),
});
export type Podstrona = z.infer<typeof Podstrona>;

/** Typy schema.org dla firmy (JSON-LD). */
export const TYPY_SCHEMA = [
  'LocalBusiness', 'Organization', 'ProfessionalService', 'HairSalon', 'BeautySalon', 'AccountingService',
  'LegalService', 'Dentist', 'MedicalClinic', 'Restaurant', 'CafeOrCoffeeShop', 'Store', 'AutoRepair',
  'HomeAndConstructionBusiness', 'RealEstateAgent', 'SportsActivityLocation', 'EducationalOrganization',
  'LodgingBusiness', 'Photographer', 'Person',
] as const;

export const Firma = z.object({
  nazwa: tekst(80),
  branza: tekst(80),
  opisKrotki: tekst(300),
  typSchema: z.enum(TYPY_SCHEMA).default('LocalBusiness'),
  adres: z.object({ ulica: tekst(100), kod: z.string().regex(/^\d{2}-\d{3}$/), miasto: tekst(60) }).optional(),
  obszar: tekstOpc(120),
  telefon: z.string().regex(/^\+?[0-9 ]{6,20}$/).optional(),
  email: z.string().email().max(120).optional(),
  godziny: z
    .array(z.object({ dni: z.array(z.enum(['pn', 'wt', 'sr', 'cz', 'pt', 'so', 'nd'])).min(1), od: z.string().regex(/^\d{2}:\d{2}$/), do: z.string().regex(/^\d{2}:\d{2}$/) }))
    .max(7)
    .default([]),
  nip: z.string().regex(/^\d{10}$/).optional(),
  social: z.array(z.object({ typ: z.enum(['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'x', 'pinterest']), url: z.string().url().startsWith('https://') })).max(7).default([]),
});
export type Firma = z.infer<typeof Firma>;

export const ZNAKI_KREATORA = ['jasny', 'ciemny', 'minimalny'] as const;

const TekstStopki = z.object({ tekst: tekstOpc(300) });

export const Strona = z.object({
  wersjaModelu: z.literal(WERSJA_MODELU),
  jezyk: z.enum(JEZYKI).default('pl'),
  /** Kreator Pro: dodatkowe wersje językowe – podstrony `<język>/…` (jezyki.ts), hreflang, przełącznik języka. */
  jezykiDodatkowe: z.array(z.enum(JEZYKI_DODATKOWE)).max(3).default([]),
  firma: Firma,
  seo: z.object({
    tytul: tekst(70),
    opis: tekst(170),
    slowaKluczowe: z.array(tekst(60)).max(12).default([]),
    obrazOg: Obraz.optional(),
  }),
  motyw: Motyw,
  strony: z.array(Podstrona).min(1).max(100),
  stopka: z.object({
    tekst: tekstOpc(300),
    politykaPrywatnosci: CelLinku.optional(),
    regulamin: CelLinku.optional(),
    /** Znak „Stworzone w Verris Kreator” – zawsze widoczny; w Pro można wybrać wariant minimalny. */
    znakKreatora: z.enum(ZNAKI_KREATORA).default('jasny'),
    /** Tekst stopki w językach dodatkowych (brak = tekst główny). Obiekt, nie rekord – edycja na stronie zna jego pola. */
    tlumaczenia: z
      .object({ en: TekstStopki.optional(), de: TekstStopki.optional(), uk: TekstStopki.optional() })
      .optional(),
  }),
});
export type Strona = z.infer<typeof Strona>;
/** Wejście przed parsowaniem (pola z domyślnymi wartościami opcjonalne) – tak pisze AI i edytor. */
export type StronaWejscie = z.input<typeof Strona>;

export type WynikWalidacji = { ok: true; strona: Strona } | { ok: false; bledy: string[] };

/** Walidacja i uzupełnienie domyślnych. Błędy jako krótkie ścieżki – nadają się do pętli naprawy AI. */
export function walidujStrone(dane: unknown): WynikWalidacji {
  const w = Strona.safeParse(dane);
  if (w.success) {
    const bledy = sprawdzSpojnosc(w.data);
    return bledy.length ? { ok: false, bledy } : { ok: true, strona: w.data };
  }
  return { ok: false, bledy: w.error.issues.slice(0, 40).map((i) => `${i.path.join('.') || '(korzeń)'}: ${i.message}`) };
}

/** Reguły, których nie wyrazi sam schemat. */
export function sprawdzSpojnosc(s: Strona): string[] {
  const bledy: string[] = [];
  const slugi = new Set<string>();
  s.strony.forEach((p, i) => {
    if (slugi.has(p.slug)) bledy.push(`strony.${i}.slug: powtórzony adres podstrony „${p.slug}”`);
    slugi.add(p.slug);
    const id = new Set<string>();
    p.sekcje.forEach((sek, j) => {
      if (id.has(sek.id)) bledy.push(`strony.${i}.sekcje.${j}.id: powtórzony identyfikator „${sek.id}”`);
      id.add(sek.id);
      if (sek.typ === 'hero' && sek.dane.wyroznienie && !sek.dane.naglowek.includes(sek.dane.wyroznienie)) {
        bledy.push(`strony.${i}.sekcje.${j}.dane.wyroznienie: fragment nie występuje w nagłówku`);
      }
    });
  });
  if (!slugi.has('')) bledy.push('strony: brak strony głównej (slug "")');
  bledy.push(...sprawdzJezyki(s));
  return bledy;
}

/** Wersje językowe: każdy język dodatkowy ma stronę główną, adresy z prefiksem języka, klucz – jedna podstrona na język. */
function sprawdzJezyki(s: Strona): string[] {
  const bledy: string[] = [];
  if (new Set(s.jezykiDodatkowe).size < s.jezykiDodatkowe.length) bledy.push('jezykiDodatkowe: powtórzony język');
  if ((s.jezykiDodatkowe as string[]).includes(s.jezyk)) bledy.push(`jezykiDodatkowe: „${s.jezyk}” to język główny strony`);
  const klucze = new Set<string>();
  s.strony.forEach((p, i) => {
    const j = jezykPodstrony(s, p);
    const prefiks = prefiksJezyka(s, p.slug);
    if (j !== s.jezyk && !(s.jezykiDodatkowe as string[]).includes(j)) bledy.push(`strony.${i}.jezyk: język „${j}” nie jest włączony w wersjach językowych`);
    else if (j !== s.jezyk && prefiks !== j) bledy.push(`strony.${i}.slug: adres podstrony w języku „${j}” musi zaczynać się od „${j}”`);
    else if (j === s.jezyk && prefiks) bledy.push(`strony.${i}.slug: adres „${p.slug}” jest zarezerwowany dla wersji „${prefiks}”`);
    if (p.slug.split('/').length > (j === s.jezyk ? 2 : 3)) bledy.push(`strony.${i}.slug: za dużo członów adresu`);
    if (p.klucz !== undefined && j === s.jezyk && p.klucz !== p.slug) bledy.push(`strony.${i}.klucz: w języku głównym klucz to adres podstrony`);
    const k = `${j}|${kluczPodstrony(s, p)}`;
    if (klucze.has(k)) bledy.push(`strony.${i}.klucz: ta podstrona ma już wersję w języku „${j}”`);
    klucze.add(k);
  });
  for (const j of s.jezykiDodatkowe) {
    if (!s.strony.some((p) => p.slug === slugGlownej(s, j))) bledy.push(`jezykiDodatkowe: wersja „${j}” nie ma strony głównej (adres „${j}”)`);
  }
  return bledy;
}

/** Wszystkie sekcje ze wszystkich podstron. */
export function wszystkieSekcje(s: Strona): Sekcja[] {
  return s.strony.flatMap((p) => p.sekcje);
}

/** Migracja starszych zapisów modelu do WERSJA_MODELU (na razie jedna wersja). */
export function migrujModel(dane: unknown): unknown {
  return dane;
}

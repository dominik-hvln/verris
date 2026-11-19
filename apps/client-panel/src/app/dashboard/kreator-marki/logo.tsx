'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  faviconSvg,
  inicjaly,
  PROPORCJE,
  rozstrzelenieNapisu,
  rysujSygnet,
  tekstPodpisu,
  wierszeNapisu,
  zlozLogo,
  type KsztaltNapisu,
  type ProjektLogo,
  type UkladLogo,
  type WariantKoloru,
} from '@verris/kreator/klient';
import { cx } from '@/components/panel/cx';
import { adresNapisu, regulyFontu } from '@/lib/kreator-marki';

/**
 * Paczka 131 – logo złożone w przeglądarce (zlozLogo z biblioteki, bez AI): najpierw napis jako `<text>` z krojem
 * ładowanym przez fonts-proxy (trasa panelu /api/kreator-marki/fonty – CSP panelu: font-src 'self'), a gdy API
 * odda krzywe napisu (GET /kreator-marki/napis, z kerningiem) – te same wymiary co w plikach do pobrania.
 * SVG wstawiamy do DOM, bo `<img>` nie ładuje fontów; treść jest bezpieczna z konstrukcji: tekst z modelu przechodzi
 * przez `esc()`, a symbol od AI / wgrany – przez walidator, który składa wynik od nowa z samej geometrii.
 */

// ───────────────────────── fonty ─────────────────────────

const wstrzykniete = new Set<string>();

function wstrzyknijFont(rodzina: string, waga: number): void {
  if (typeof document === 'undefined') return;
  const klucz = `${rodzina}|${waga}`;
  if (wstrzykniete.has(klucz)) return;
  const reguly = regulyFontu(rodzina, waga);
  wstrzykniete.add(klucz);
  if (!reguly) return;
  let el = document.getElementById('kreator-marki-fonty') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'kreator-marki-fonty';
    document.head.appendChild(el);
  }
  el.appendChild(document.createTextNode(`${reguly}\n`));
}

/** Rejestruje @font-face krojów (pobranie pliku następuje dopiero, gdy krój jest widoczny). */
export function useFonty(lista: { rodzina: string; waga: number }[]): void {
  const klucz = lista.map((f) => `${f.rodzina}|${f.waga}`).join(';');
  useEffect(() => {
    for (const f of klucz.split(';')) {
      const [rodzina, waga] = f.split('|');
      if (rodzina) wstrzyknijFont(rodzina, Number(waga) || 400);
    }
  }, [klucz]);
}

// ───────────────────────── krzywe napisu ─────────────────────────

interface ZadanieNapisu {
  font: string;
  waga: number;
  tekst: string;
  rozstrzelenie: number;
}

const pamiecKsztaltow = new Map<string, Promise<KsztaltNapisu | null>>();

/** Odpowiedź API → kształt (tylko dane ścieżki i liczby; zloz.ts i tak escapuje `d`). */
export function odczytajKsztalt(dane: unknown): KsztaltNapisu | null {
  if (!dane || typeof dane !== 'object') return null;
  const k = dane as Record<string, unknown>;
  const liczba = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (typeof k.d !== 'string' || k.d.length > 200_000 || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,eE\s+-]*$/.test(k.d)) return null;
  if (!liczba(k.szerokosc) || !liczba(k.wysokoscWersalikow) || !liczba(k.zejscie) || (k.wysokoscWersalikow as number) <= 0) return null;
  return { d: k.d, szerokosc: k.szerokosc as number, wysokoscWersalikow: k.wysokoscWersalikow as number, zejscie: k.zejscie as number };
}

function pobierzKsztalt(z: ZadanieNapisu): Promise<KsztaltNapisu | null> {
  const klucz = JSON.stringify(z);
  const zapis = pamiecKsztaltow.get(klucz);
  if (zapis) return zapis;
  if (pamiecKsztaltow.size > 400) pamiecKsztaltow.clear();
  const p = fetch(adresNapisu(z), { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then(odczytajKsztalt)
    .catch(() => null);
  pamiecKsztaltow.set(klucz, p);
  return p;
}

/** Teksty do kształtowania: [wiersz 1, wiersz 2 | null, podpis | null] – dokładnie te, które składa zlozLogo. */
export function zadaniaNapisu(projekt: ProjektLogo, nazwa: string, podpis?: string): (ZadanieNapisu | null)[] {
  const wiersze = wierszeNapisu(nazwa, projekt.napis.styl);
  const n = { font: projekt.napis.font, waga: projekt.napis.waga, rozstrzelenie: rozstrzelenieNapisu(projekt.napis) };
  const pod = podpis?.trim() && projekt.napis.podpis
    ? { font: projekt.fonty.tekst, waga: 600, tekst: tekstPodpisu(podpis), rozstrzelenie: PROPORCJE.podpisRozstrzelenie * 1000 }
    : null;
  return [wiersze[0] ? { ...n, tekst: wiersze[0] } : null, wiersze[1] ? { ...n, tekst: wiersze[1] } : null, pod];
}

/** Krzywe napisu z API (z pamięcią); do czasu odpowiedzi – null (podgląd `<text>`). */
export function useKsztaltyNapisu(projekt: ProjektLogo, nazwa: string, podpis: string | undefined, wlaczone = true): (KsztaltNapisu | null)[] | null {
  const zadania = useMemo(() => zadaniaNapisu(projekt, nazwa, podpis), [projekt, nazwa, podpis]);
  const klucz = JSON.stringify(zadania);
  const [wynik, setWynik] = useState<{ klucz: string; ksztalty: (KsztaltNapisu | null)[] } | null>(null);
  useEffect(() => {
    if (!wlaczone) return;
    let aktualny = true;
    const lista = JSON.parse(klucz) as (ZadanieNapisu | null)[];
    // krótka zwłoka – suwak rozstrzelenia nie wysyła zapytania przy każdym pikselu
    const t = setTimeout(() => {
      void Promise.all(lista.map((z) => (z ? pobierzKsztalt(z) : Promise.resolve(null)))).then((k) => {
        if (aktualny) setWynik({ klucz, ksztalty: k });
      });
    }, 220);
    return () => {
      aktualny = false;
      clearTimeout(t);
    };
  }, [klucz, wlaczone]);
  return wynik?.klucz === klucz ? wynik.ksztalty : null;
}

// ───────────────────────── logo ─────────────────────────

export interface LogoProps {
  projekt: ProjektLogo;
  nazwa: string;
  podpis?: string;
  uklad?: UkladLogo;
  wariant?: WariantKoloru;
  /** Wysokość docelowa (reguły minimalnych rozmiarów: poniżej progów bez podpisu / sam znak). */
  wysokoscPx?: number;
  /** Tło negatywu w SVG (domyślnie tak; w kafelku w kolorze marki – nie). */
  tlo?: boolean;
  /** Krzywe napisu z API – w miniaturach można wyłączyć (wtedy sam `<text>`). */
  krzywe?: boolean;
  className?: string;
}

/** Złożenie logo do HTML (puste przy błędzie biblioteki – podgląd nie wywraca ekranu). */
export function svgLogo(p: LogoProps, ks: (KsztaltNapisu | null)[] | null): string {
  try {
    return zlozLogo(p.projekt, p.nazwa, p.podpis, {
      uklad: p.uklad ?? p.projekt.uklad,
      wariant: p.wariant ?? 'kolor',
      wysokoscPx: p.wysokoscPx,
      metadaneAi: false,
      tlo: p.tlo,
      napis: ks?.[0] ?? null,
      napis2: ks?.[1] ?? null,
      podpis: ks?.[2] ?? null,
    }).svg;
  } catch {
    return '';
  }
}

export function LogoNaZywo(p: LogoProps) {
  const { projekt, nazwa, podpis, krzywe = true, className } = p;
  useFonty([
    { rodzina: projekt.napis.font, waga: projekt.napis.waga },
    { rodzina: projekt.fonty.tekst, waga: 600 },
  ]);
  const ks = useKsztaltyNapisu(projekt, nazwa, podpis, krzywe);
  const svg = useMemo(() => svgLogo(p, ks), [p.projekt, p.nazwa, p.podpis, p.uklad, p.wariant, p.wysokoscPx, p.tlo, ks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!svg) {
    return (
      <div className={cx('flex items-center justify-center text-[12px] text-muted-foreground', className)} role="img" aria-label={`Logo: ${nazwa}`}>
        Nie udało się pokazać podglądu
      </div>
    );
  }
  return (
    <div
      className={cx('flex items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full', className)}
      // SVG z biblioteki marki: tekst przez esc(), symbole po walidatorze (składane od nowa)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Favicon (wariant „favicon” znaku, uproszczony) – na kafelku w kolorze marki albo w kolorach marki. */
export function FaviconNaZywo({ projekt, nazwa, rozmiar, kafel = false }: { projekt: ProjektLogo; nazwa: string; rozmiar: number; kafel?: boolean }) {
  const svg = useMemo(() => {
    try {
      const wnetrze = rysujSygnet(projekt.sygnet, { wariant: 'favicon', nazwa });
      return wnetrze ? faviconSvg(wnetrze, projekt.kolory, { kafel }) : '';
    } catch {
      return '';
    }
  }, [projekt.sygnet, projekt.kolory, nazwa, kafel]);
  if (!svg) {
    // marka „sam napis” – favicon z inicjałów (tak robi też API)
    return (
      <span
        role="img"
        aria-label={`Favicon ${rozmiar} px`}
        className="grid flex-none place-items-center rounded-[3px] font-bold leading-none"
        style={{ width: rozmiar, height: rozmiar, background: projekt.kolory.glowny, color: '#FFFFFF', fontSize: Math.max(7, rozmiar * 0.5) }}
      >
        {inicjaly(nazwa, 1)}
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`Favicon ${rozmiar} px`}
      className="block flex-none [&>svg]:h-full [&>svg]:w-full"
      style={{ width: rozmiar, height: rozmiar }}
      // SVG z biblioteki marki (geometria znaku, kolory z modelu)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

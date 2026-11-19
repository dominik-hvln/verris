'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import {
  formatCmyk,
  kontrast,
  MINIMALNE_ROZMIARY,
  opisKoloru,
  zlozLogo,
  type Marka,
  type ProjektLogo,
  type UkladLogo,
  type WariantKoloru,
  type WidokMarki,
} from '@verris/kreator/klient';
import { ADRES_TMVIEW, stosFontuPanelu } from '@/lib/kreator-marki';
import { FaviconNaZywo, LogoNaZywo, useFonty } from './logo';

/**
 * Paczka 131 – zasady marki liczone z geometrii znaku i palety: warianty (6), pole ochronne (x = ½ wysokości sygnetu),
 * minimalne rozmiary (reguly.ts), favicon i ikona, paleta z HEX/RGB/CMYK (orientacyjnie, bez profilu ICC) i kontrastem,
 * typografia, kontrola przed użyciem (ocena reguł z API + podobieństwo – sprawdź samodzielnie, to nie badanie prawne).
 */
const f2 = (x: number) => x.toFixed(2).replace('.', ',');

const WARIANTY: { uklad: UkladLogo; wariant: WariantKoloru; nazwa: string; opis: string; tlo: (p: ProjektLogo) => string }[] = [
  { uklad: 'poziomy', wariant: 'kolor', nazwa: 'Poziomy', opis: 'podstawowy', tlo: () => '#FFFFFF' },
  { uklad: 'pionowy', wariant: 'kolor', nazwa: 'Pionowy', opis: 'kwadratowe miejsca', tlo: () => '#FFFFFF' },
  { uklad: 'sygnet', wariant: 'kolor', nazwa: 'Sygnet', opis: 'awatar, favicon', tlo: (p) => p.kolory.paleta.tlo },
  { uklad: 'poziomy', wariant: 'mono', nazwa: 'Jednobarwny', opis: 'pieczątka, grawer, faks', tlo: () => '#FFFFFF' },
  { uklad: 'poziomy', wariant: 'negatyw', nazwa: 'Negatyw', opis: 'na kolorze marki', tlo: (p) => p.kolory.glowny },
  { uklad: 'poziomy', wariant: 'bialy', nazwa: 'Biały', opis: 'na zdjęciach', tlo: () => 'linear-gradient(135deg, #5B6B73 0%, #2E3A40 100%)' },
];

function Karta({ tytul, children, className = '' }: { tytul: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4 ${className}`}>
      <h2 className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tytul}</h2>
      {children}
    </section>
  );
}

/** Proporcje pola ochronnego z geometrii złożonego logo (w procentach ramki). */
export function poleOchronne(projekt: ProjektLogo, nazwa: string, podpis?: string): { x: number; szer: number; wys: number } | null {
  try {
    const z = zlozLogo(projekt, nazwa, podpis, { uklad: 'poziomy', wariant: 'kolor', metadaneAi: false });
    return { x: z.poleOchronne, szer: z.szerokosc, wys: z.wysokosc };
  } catch {
    return null;
  }
}

function Paleta({ kolory }: { kolory: ProjektLogo['kolory'] }) {
  const pozycje: { nazwa: string; hex: string; uzycie: string }[] = [
    { nazwa: 'Główny', hex: kolory.glowny, uzycie: 'znak, napis, negatyw' },
    { nazwa: 'Akcent', hex: kolory.akcent, uzycie: 'drugi kolor znaku, wyróżnienia' },
    { nazwa: 'Akcent jasny', hex: kolory.akcentJasny, uzycie: 'akcent na kolorze głównym' },
    { nazwa: 'Tło jasne', hex: kolory.paleta.tlo, uzycie: 'tło stron i materiałów' },
    { nazwa: 'Tekst', hex: kolory.paleta.tekst, uzycie: 'tekst na jasnym tle' },
  ];
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {pozycje.map((p) => {
        const o = opisKoloru(p.hex);
        const k = kontrast(p.hex, '#FFFFFF');
        const kTekst = kontrast(p.hex, kolory.paleta.tekst);
        const zBiela = p.nazwa !== 'Tło jasne';
        const wartosc = zBiela ? k : kTekst;
        const ocena = wartosc >= 4.5 ? 'tekst i grafika' : wartosc >= 3 ? 'grafika, duże napisy' : 'tylko dekoracja';
        return (
          <li key={p.nazwa} className="flex items-center gap-3">
            <span aria-hidden className="h-11 w-11 flex-none rounded-[8px] border border-line" style={{ background: p.hex }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-foreground">
                {p.nazwa} · <span className="font-mono">{o.hex}</span>
              </span>
              <span className="block font-mono text-[11px] text-muted-foreground">
                RGB {o.rgb.join(' ')} · {formatCmyk(o.cmyk)} · oklch({o.oklch.l} {o.oklch.c} {o.oklch.h})
              </span>
              <span className="block text-[11.5px] text-muted-foreground">{p.uzycie}</span>
            </span>
            <span className={`flex-none rounded-full border px-2 py-0.5 font-mono text-[11px] ${wartosc >= 4.5 ? 'border-data/50 text-data-hi' : wartosc >= 3 ? 'border-warn/50 text-warn' : 'border-line text-muted-foreground'}`}>
              {f2(wartosc)}:1 · {ocena}
              <span className="sr-only">{zBiela ? ' (kontrast z bielą)' : ' (kontrast z tekstem)'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ZasadyMarki({ widok, marka }: { widok: WidokMarki; marka: Marka }) {
  const projekt = marka.projekt;
  const nazwa = marka.brief.nazwa;
  const podpis = marka.brief.podpis;
  useFonty([
    { rodzina: projekt.fonty.naglowki, waga: 600 },
    { rodzina: projekt.fonty.tekst, waga: 400 },
  ]);
  const pole = useMemo(() => poleOchronne(projekt, nazwa, podpis), [projekt, nazwa, podpis]);
  const maSygnet = projekt.sygnet.typ !== 'brak';
  const ocena = widok.ocena;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Karta tytul="Warianty logo">
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {WARIANTY.filter((w) => maSygnet || w.uklad !== 'sygnet').map((w) => (
              <li key={`${w.uklad}-${w.wariant}`} className="flex flex-col gap-1">
                <div className="flex h-32 items-center justify-center rounded-[8px] border border-line p-4" style={{ background: w.tlo(projekt) }}>
                  <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} uklad={maSygnet ? w.uklad : 'napis'} wariant={w.wariant} tlo={false} className="h-full w-full" />
                </div>
                <span className="text-[12px] text-muted-foreground">
                  <b className="text-foreground">{w.nazwa}</b> · {w.opis}
                </span>
              </li>
            ))}
          </ul>
        </Karta>
        <div className="grid gap-5 lg:grid-cols-2">
          <Karta tytul="Pole ochronne i minimalny rozmiar">
            {pole ? (
              <div className="rounded-[8px] bg-[#ffffff] p-3">
                <div
                  className="relative mx-auto w-full max-w-[320px] border border-dashed"
                  style={{ aspectRatio: `${pole.szer + 2 * pole.x} / ${pole.wys + 2 * pole.x}`, borderColor: '#C2410C' }}
                  role="img"
                  aria-label={`Pole ochronne: wolne miejsce x z każdej strony logo, x to połowa wysokości sygnetu`}
                >
                  <div
                    className="absolute"
                    style={{
                      left: `${(pole.x / (pole.szer + 2 * pole.x)) * 100}%`,
                      right: `${(pole.x / (pole.szer + 2 * pole.x)) * 100}%`,
                      top: `${(pole.x / (pole.wys + 2 * pole.x)) * 100}%`,
                      bottom: `${(pole.x / (pole.wys + 2 * pole.x)) * 100}%`,
                    }}
                  >
                    <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} uklad="poziomy" className="h-full w-full" />
                  </div>
                  <span className="absolute left-0.5 top-0.5 font-mono text-[10px]" style={{ color: '#C2410C' }} aria-hidden>
                    x
                  </span>
                  <span className="absolute bottom-0.5 right-0.5 font-mono text-[10px]" style={{ color: '#C2410C' }} aria-hidden>
                    x
                  </span>
                </div>
              </div>
            ) : null}
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[12.5px] text-foreground">
              <li>x = połowa wysokości sygnetu – wolne miejsce z każdej strony logo.</li>
              <li>
                Logo poziome: min. {MINIMALNE_ROZMIARY.logoEkranPx} px wysokości na ekranie, {MINIMALNE_ROZMIARY.logoDrukMm} mm w druku.
              </li>
              <li>Podpis pod nazwą – dopiero od {MINIMALNE_ROZMIARY.podpisOdPx} px wysokości logo.</li>
              <li>Poniżej minimum – sam sygnet (favicon ma uproszczoną, grubszą wersję znaku).</li>
            </ul>
            <div className="flex flex-wrap items-end gap-4 rounded-[8px] bg-[#ffffff] p-3" aria-label="Logo w małych rozmiarach" role="group">
              {[MINIMALNE_ROZMIARY.podpisOdPx, MINIMALNE_ROZMIARY.logoEkranPx, 20].map((h) => (
                <figure key={h} className="m-0 flex flex-col items-start gap-1">
                  <div style={{ height: h }}>
                    <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} wysokoscPx={h} className="h-full" />
                  </div>
                  <figcaption className="font-mono text-[10.5px]" style={{ color: '#4B5A53' }}>
                    {h} px
                  </figcaption>
                </figure>
              ))}
            </div>
          </Karta>
          <Karta tytul="Favicon i ikona">
            <div className="flex flex-wrap items-end gap-4">
              {[16, 32].map((r) => (
                <figure key={r} className="m-0 flex flex-col items-center gap-1">
                  <FaviconNaZywo projekt={projekt} nazwa={nazwa} rozmiar={r} />
                  <figcaption className="text-[11.5px] text-muted-foreground">{r} px</figcaption>
                </figure>
              ))}
              <figure className="m-0 flex flex-col items-center gap-1">
                <FaviconNaZywo projekt={projekt} nazwa={nazwa} rozmiar={64} kafel />
                <figcaption className="text-[11.5px] text-muted-foreground">ikona 180 px</figcaption>
              </figure>
            </div>
            <p className="text-[12px] text-muted-foreground">
              W eksporcie: favicon.ico (16, 32, 48 px), favicon.svg z wersją dla ciemnego motywu, ikona 180 px dla iPhone i ikony 192/512 px aplikacji.
            </p>
          </Karta>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <Karta tytul="Paleta i kontrast">
          <Paleta kolory={projekt.kolory} />
          <p className="text-[11.5px] text-muted-foreground">
            CMYK to wartości orientacyjne (bez profilu barwnego). Przed drukiem poproś drukarnię o przeliczenie swoim profilem i próbę.
          </p>
        </Karta>
        <Karta tytul="Typografia">
          <div className="rounded-[8px] bg-[#ffffff] p-4" style={{ color: projekt.kolory.paleta.tekst }}>
            <p className="m-0 text-[22px] font-semibold leading-tight" style={{ fontFamily: stosFontuPanelu(projekt.fonty.naglowki), color: projekt.kolory.glowny }}>
              {nazwa}
            </p>
            <p className="m-0 mt-2 text-[13.5px] leading-relaxed" style={{ fontFamily: stosFontuPanelu(projekt.fonty.tekst) }}>
              {marka.brief.opis}
            </p>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Napis w logo: {projekt.napis.font} {projekt.napis.waga} · nagłówki: {projekt.fonty.naglowki} · tekst: {projekt.fonty.tekst}. Wszystkie na licencji SIL OFL 1.1 – wolno ich używać w logo, na
            stronie i w druku.
          </p>
        </Karta>
        <Karta tytul="Kontrola przed użyciem">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px] text-foreground">
            {ocena && ocena.bledy.length === 0 ? (
              <li className="flex gap-1.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden /> Kontrast i czytelność w 16 px – reguły spełnione.
              </li>
            ) : null}
            {ocena?.bledy.map((b) => (
              <li key={b} className="flex gap-1.5">
                <XCircle className="mt-0.5 h-4 w-4 flex-none text-crit" aria-hidden /> {b}
              </li>
            ))}
            {ocena?.ostrzezenia.map((o) => (
              <li key={o} className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warn" aria-hidden /> {o}
              </li>
            ))}
            <li className="flex gap-1.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden /> Napis w plikach zamieniony na krzywe – działa bez instalowania kroju.
            </li>
            <li className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warn" aria-hidden /> Podobieństwo do zarejestrowanych znaków – sprawdź samodzielnie. To nie jest badanie prawne.
            </li>
          </ul>
          <a href={ADRES_TMVIEW} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-data-hi underline underline-offset-2">
            Sprawdź podobne znaki w TMview <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only"> (otwiera się w nowej karcie)</span>
          </a>
        </Karta>
      </div>
    </div>
  );
}

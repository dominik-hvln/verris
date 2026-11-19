'use client';

import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import {
  CHARAKTERY_PALET,
  hexDoOklch,
  KATALOG_FONTOW,
  kontrastyMarki,
  MIN_KONTRAST_AKCENTU_JASNEGO,
  MIN_KONTRAST_NAPISU,
  MIN_KONTRAST_ZNAKU,
  ocenProjekt,
  rodzinaPoId,
  STYLE_NAPISU,
  UKLADY_LOGO,
  type CharakterPalety,
  type Marka,
  type ProjektLogo,
  type UkladLogo,
  type WariantKoloru,
} from '@verris/kreator/klient';
import { Select } from '@/components/panel/select';
import { Switch } from '@/components/panel/v2';
import { cx } from '@/components/panel/cx';
import {
  ETYKIETY_CHARAKTERU,
  ETYKIETY_STYLU,
  ETYKIETY_UKLADU,
  ETYKIETY_WARIANTU,
  nazwaBarwy,
  normalizujBarwe,
  normalizujHex,
  stosFontuPanelu,
  stylDozwolony,
  zmienKolory,
  zmienKoloryHex,
  zmienKroj,
  zmienLitery,
  zmienParametr,
} from '@/lib/kreator-marki';
import { Kafelki, Komunikat, klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../kreator/wspolne';
import { FaviconNaZywo, LogoNaZywo, useFonty } from './logo';
import { PasekBarw } from './wybierak-barwy';

/**
 * Paczka 131 – „Dopasuj” na żywo (bez AI – limit nie spada): kolor (barwa + charakter palety albo własne HEX z kontrolą
 * kontrastu), krój i waga (Select z podglądem kroju), styl napisu, rozstrzelenie, układ, parametry rodziny znaku
 * (zakresy z katalogu), litery monogramu, fonty strony. Ocena reguł (ocenProjekt) liczona w przeglądarce; API ocenia
 * ponownie przy zapisie (PUT …/projekt) albo wyborze kierunku (POST …/wybierz).
 */

const f2 = (x: number) => x.toFixed(2).replace('.', ',');

function Sekcja({ tytul, children, opis }: { tytul: string; children: ReactNode; opis?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-line pt-3.5 first:border-t-0 first:pt-0">
      <h3 className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tytul}</h3>
      {opis ? <p className="-mt-1 text-[12px] text-muted-foreground">{opis}</p> : null}
      {children}
    </section>
  );
}

function Suwak({ etykieta, min, max, krok = 1, wartosc, onZmiana, jednostka = '' }: { etykieta: string; min: number; max: number; krok?: number; wartosc: number; onZmiana: (v: number) => void; jednostka?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12.5px] text-foreground">
          {etykieta}
        </label>
        <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {wartosc}
          {jednostka}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={krok}
        value={wartosc}
        onChange={(e) => onZmiana(Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-[var(--data)] max-md:h-11"
      />
    </div>
  );
}

const pierwszaWielka = (t: string) => t.charAt(0).toLocaleUpperCase('pl-PL') + t.slice(1);

function WierszKontrastu({ etykieta, wartosc, prog }: { etykieta: string; wartosc: number; prog: number }) {
  const ok = wartosc >= prog;
  return (
    <li className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-foreground">{etykieta}</span>
      <span className={cx('inline-flex items-center gap-1 font-mono tabular-nums', ok ? 'text-data-hi' : 'text-crit')}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
        {f2(wartosc)}:1<span className="sr-only">{ok ? ' – spełnia' : ' – za mało'}</span>
        <span className="text-muted-foreground"> (min. {f2(prog).replace(/,00$/, '')}:1)</span>
      </span>
    </li>
  );
}

export function PanelKolorow({ projekt, onZmiana }: { projekt: ProjektLogo; onZmiana: (p: ProjektLogo) => void }) {
  const [tryb, setTryb] = useState<'barwa' | 'hex'>('barwa');
  const k = projekt.kolory;
  const [hexG, setHexG] = useState(k.glowny);
  const [hexA, setHexA] = useState(k.akcent);
  const [korekta, setKorekta] = useState<{ glowny: boolean; akcent: boolean } | null>(null);
  const akcentBarwa = Math.round(hexDoOklch(k.akcent).h);
  const kon = kontrastyMarki(k);
  const zastosujHex = (g: string, a: string) => {
    const ng = normalizujHex(g);
    const na = normalizujHex(a);
    if (!ng || !na) return;
    const w = zmienKoloryHex(projekt, ng, na);
    setKorekta(w.skorygowane.glowny || w.skorygowane.akcent ? w.skorygowane : null);
    onZmiana(w.projekt);
  };
  return (
    <div className="flex flex-col gap-3">
      <Kafelki<'barwa' | 'hex'>
        etykieta="Sposób wyboru koloru"
        ukryjEtykiete
        wartosc={tryb}
        kolumny="grid-cols-2"
        opcje={[
          { wartosc: 'barwa', nazwa: 'Barwa i charakter' },
          { wartosc: 'hex', nazwa: 'Własne HEX' },
        ]}
        onZmiana={(t) => {
          setTryb(t);
          setHexG(k.glowny);
          setHexA(k.akcent);
        }}
      />
      {tryb === 'barwa' ? (
        <>
          <div className="flex flex-col gap-1">
            <span aria-hidden className="text-[12.5px] text-foreground">
              Barwa główna <span className="text-muted-foreground">· {nazwaBarwy(k.barwa)}</span>
            </span>
            <PasekBarw etykieta="Barwa główna" barwa={k.barwa} onZmiana={(h) => onZmiana(zmienKolory(projekt, h, k.charakter))} />
          </div>
          <div className="flex flex-col gap-1">
            <span aria-hidden className="text-[12.5px] text-foreground">
              Barwa akcentu <span className="text-muted-foreground">· {nazwaBarwy(akcentBarwa)}</span>
            </span>
            <PasekBarw etykieta="Barwa akcentu" barwa={normalizujBarwe(akcentBarwa)} onZmiana={(h) => onZmiana(zmienKolory(projekt, k.barwa, k.charakter, h))} />
          </div>
          <Kafelki<CharakterPalety>
            etykieta="Charakter palety"
            wartosc={k.charakter}
            kolumny="grid-cols-2 sm:grid-cols-3"
            opcje={CHARAKTERY_PALET.map((c) => ({ wartosc: c, nazwa: ETYKIETY_CHARAKTERU[c] }))}
            onZmiana={(c) => onZmiana(zmienKolory(projekt, k.barwa, c, akcentBarwa))}
          />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['Kolor główny', hexG, setHexG, (v: string) => zastosujHex(v, hexA)],
              ['Akcent', hexA, setHexA, (v: string) => zastosujHex(hexG, v)],
            ] as const
          ).map(([etykieta, wartosc, ustaw, zastosuj]) => (
            <label key={etykieta} className="flex flex-col gap-1 text-[12.5px] text-foreground">
              {etykieta}
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-8 w-8 flex-none rounded-[6px] border border-line" style={{ background: normalizujHex(wartosc) ?? 'transparent' }} />
                <input
                  className={cx(klasaPola, 'font-mono uppercase')}
                  value={wartosc}
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={!normalizujHex(wartosc)}
                  onChange={(e) => {
                    ustaw(e.target.value);
                    if (normalizujHex(e.target.value)) zastosuj(e.target.value);
                  }}
                />
              </span>
            </label>
          ))}
        </div>
      )}
      {korekta && tryb === 'hex' ? (
        <p className="text-[12px] text-warn">
          {korekta.glowny ? `Kolor główny przyciemniliśmy do ${k.glowny}, żeby napis był czytelny na bieli. ` : ''}
          {korekta.akcent ? `Akcent zmieniliśmy na ${k.akcent} – kontrast z bielą musi mieć co najmniej 3:1.` : ''}
        </p>
      ) : null}
      <div className="flex gap-1.5" aria-label="Kolory marki" role="group">
        {[
          ['Główny', k.glowny],
          ['Akcent', k.akcent],
          ['Akcent jasny', k.akcentJasny],
        ].map(([n, c]) => (
          <span key={n} className="flex min-w-0 flex-1 flex-col gap-1 rounded-[7px] border border-line p-1.5">
            <span aria-hidden className="h-6 rounded-[4px]" style={{ background: c }} />
            <span className="break-words text-[11px] text-muted-foreground">
              {n} <span className="font-mono">{c}</span>
            </span>
          </span>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Kontrast kolorów">
        <WierszKontrastu etykieta="Napis na bieli" wartosc={kon.glownyNaBieli} prog={MIN_KONTRAST_NAPISU} />
        <WierszKontrastu etykieta="Akcent na bieli" wartosc={kon.akcentNaBieli} prog={MIN_KONTRAST_ZNAKU} />
        <WierszKontrastu etykieta="Jasny akcent w negatywie" wartosc={kon.akcentJasnyNaGlownym} prog={MIN_KONTRAST_AKCENTU_JASNEGO} />
      </ul>
    </div>
  );
}

/** Opcje kroju do Select – etykieta pisana tym krojem (styl), krój ładowany dopiero, gdy lista jest widoczna. */
export function opcjeKrojow(): { value: string; label: string; styl: { fontFamily: string } }[] {
  return KATALOG_FONTOW.map((f) => ({ value: f.rodzina, label: f.rodzina, styl: { fontFamily: stosFontuPanelu(f.rodzina) } }));
}

export function PanelDopasuj({
  projekt,
  onZmiana,
  nazwa,
  podpis,
  pelny = false,
}: {
  projekt: ProjektLogo;
  onZmiana: (p: ProjektLogo) => void;
  nazwa: string;
  podpis?: string;
  /** Pełny panel (krok „Dopasuj”): także parametry znaku, litery i fonty strony. */
  pelny?: boolean;
}) {
  const id = useId();
  const kroje = useMemo(() => opcjeKrojow(), []);
  // krój każdej pozycji listy w jego podstawowej wadze (plik pobierze się dopiero przy otwartej liście)
  useFonty(KATALOG_FONTOW.map((f) => ({ rodzina: f.rodzina, waga: f.wagi.includes(400) ? 400 : f.wagi[0]! })));
  const font = KATALOG_FONTOW.find((f) => f.rodzina === projekt.napis.font);
  const s = projekt.sygnet;
  const rodzina = s.typ === 'biblioteka' ? rodzinaPoId(s.rodzina) : undefined;
  const zmienNapis = (n: Partial<ProjektLogo['napis']>) => onZmiana({ ...projekt, napis: { ...projekt.napis, ...n } });

  return (
    <div className="flex flex-col gap-4">
      <Sekcja tytul="Kolory">
        <PanelKolorow projekt={projekt} onZmiana={onZmiana} />
      </Sekcja>

      <Sekcja tytul="Krój napisu" opis="Kroje na licencji SIL OFL 1.1 – wolno ich używać w logo, na stronie i w druku.">
        <label htmlFor={`${id}-kroj`} className="sr-only">
          Krój napisu
        </label>
        <Select id={`${id}-kroj`} value={projekt.napis.font} options={kroje} onChange={(v) => onZmiana(zmienKroj(projekt, v))} />
        {font && font.wagi.length > 1 ? (
          <Kafelki<string>
            etykieta="Grubość"
            wartosc={String(projekt.napis.waga)}
            kolumny="grid-cols-3"
            opcje={font.wagi.map((w) => ({ wartosc: String(w), nazwa: <span style={{ fontFamily: stosFontuPanelu(font.rodzina), fontWeight: w }}>{w}</span> }))}
            onZmiana={(w) => zmienNapis({ waga: Number(w) })}
          />
        ) : null}
      </Sekcja>

      <Sekcja tytul="Napis">
        <Kafelki<ProjektLogo['napis']['styl']>
          etykieta="Styl napisu"
          ukryjEtykiete
          wartosc={projekt.napis.styl}
          kolumny="grid-cols-2 sm:grid-cols-3"
          opcje={STYLE_NAPISU.map((st) => ({
            wartosc: st,
            nazwa: ETYKIETY_STYLU[st],
            wylaczona: !stylDozwolony(st, nazwa),
            opis: !stylDozwolony(st, nazwa) ? 'nazwa z 2 słów' : undefined,
          }))}
          onZmiana={(st) => zmienNapis({ styl: st })}
        />
        <Suwak etykieta="Rozstrzelenie liter" min={-50} max={400} krok={10} wartosc={projekt.napis.rozstrzelenie} onZmiana={(v) => zmienNapis({ rozstrzelenie: v })} jednostka="/1000 em" />
        {podpis?.trim() ? (
          <div className="flex items-center justify-between gap-2 text-[12.5px] text-foreground">
            <span>Podpis „{podpis}” w logo</span>
            <Switch checked={projekt.napis.podpis} onChange={(v) => zmienNapis({ podpis: v })} label="Podpis pod nazwą w logo" />
          </div>
        ) : null}
      </Sekcja>

      <Sekcja tytul="Układ">
        <Kafelki<UkladLogo>
          etykieta="Układ logo"
          ukryjEtykiete
          wartosc={projekt.uklad}
          kolumny="grid-cols-2 sm:grid-cols-4"
          opcje={UKLADY_LOGO.map((u) => ({ wartosc: u, nazwa: ETYKIETY_UKLADU[u], wylaczona: s.typ === 'brak' && u !== 'napis' }))}
          onZmiana={(u) => onZmiana({ ...projekt, uklad: u })}
        />
      </Sekcja>

      {pelny && rodzina ? (
        <Sekcja tytul={`Znak – ${rodzina.nazwa}`} opis={rodzina.opis}>
          {rodzina.monogram && s.typ === 'biblioteka' ? (
            <label className="flex flex-col gap-1 text-[12.5px] text-foreground">
              Litery monogramu (1–2)
              <input
                className={cx(klasaPola, 'w-24 font-mono uppercase')}
                defaultValue={s.litery ?? ''}
                maxLength={2}
                onChange={(e) => onZmiana(zmienLitery(projekt, e.target.value))}
              />
            </label>
          ) : null}
          {rodzina.parametry.map((p) => {
            const v = s.typ === 'biblioteka' ? (s.parametry[p.klucz] ?? p.domyslna) : p.domyslna;
            if (p.min === 0 && p.max === 1) {
              return (
                <div key={p.klucz} className="flex items-center justify-between gap-2 text-[12.5px] text-foreground">
                  <span>{pierwszaWielka(p.opis.replace(/\s*\(0\/1\)$/, ''))}</span>
                  <Switch checked={v === 1} onChange={(on) => onZmiana(zmienParametr(projekt, p.klucz, on ? 1 : 0))} label={pierwszaWielka(p.opis)} />
                </div>
              );
            }
            return <Suwak key={p.klucz} etykieta={pierwszaWielka(p.opis)} min={p.min} max={p.max} wartosc={v} onZmiana={(x) => onZmiana(zmienParametr(projekt, p.klucz, x))} />;
          })}
        </Sekcja>
      ) : null}

      {pelny ? (
        <Sekcja tytul="Fonty strony i materiałów">
          {(['naglowki', 'tekst'] as const).map((klucz) => (
            <div key={klucz} className="flex flex-col gap-1">
              <label htmlFor={`${id}-${klucz}`} className="text-[12.5px] text-foreground">
                {klucz === 'naglowki' ? 'Nagłówki' : 'Tekst'}
              </label>
              <Select id={`${id}-${klucz}`} value={projekt.fonty[klucz]} options={kroje} onChange={(v) => onZmiana({ ...projekt, fonty: { ...projekt.fonty, [klucz]: v } })} />
            </div>
          ))}
        </Sekcja>
      ) : null}
    </div>
  );
}

/** Ocena reguł na żywo (ta sama funkcja co w API); odroczona, żeby suwak nie przycinał podglądu. */
export function useOcena(projekt: ProjektLogo, nazwa: string) {
  const odroczony = useDeferredValue(projekt);
  return useMemo(() => {
    try {
      return ocenProjekt(odroczony, nazwa);
    } catch {
      return { ok: true, bledy: [], ostrzezenia: [] };
    }
  }, [odroczony, nazwa]);
}

export function ListaOceny({ ocena, className }: { ocena: { bledy: string[]; ostrzezenia: string[] }; className?: string }) {
  if (!ocena.bledy.length && !ocena.ostrzezenia.length) {
    return (
      <p className={cx('flex items-center gap-1.5 text-[12.5px] text-data-hi', className)}>
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Znak spełnia reguły czytelności i kontrastu.
      </p>
    );
  }
  return (
    <ul className={cx('m-0 flex list-none flex-col gap-1.5 p-0', className)} aria-live="polite">
      {ocena.bledy.map((b) => (
        <li key={b} className="flex gap-1.5 text-[12.5px] text-foreground">
          <XCircle className="mt-0.5 h-4 w-4 flex-none text-crit" aria-hidden />
          <span>
            <span className="sr-only">Błąd: </span>
            {b}
          </span>
        </li>
      ))}
      {ocena.ostrzezenia.map((o) => (
        <li key={o} className="flex gap-1.5 text-[12.5px] text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warn" aria-hidden />
          <span>
            <span className="sr-only">Uwaga: </span>
            {o}
          </span>
        </li>
      ))}
    </ul>
  );
}

const TLO_WARIANTU: Record<WariantKoloru, (p: ProjektLogo) => string> = {
  kolor: () => '#FFFFFF',
  mono: () => '#FFFFFF',
  negatyw: (p) => p.kolory.glowny,
  bialy: () => 'linear-gradient(135deg, #5B6B73 0%, #2E3A40 100%)',
};

/** Logo w wariantach kolor / jednobarwny / negatyw / biały (biały na tle „zdjęcia”). */
export function WariantyLogo({ projekt, nazwa, podpis, uklad }: { projekt: ProjektLogo; nazwa: string; podpis?: string; uklad?: UkladLogo }) {
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-4">
      {(Object.keys(ETYKIETY_WARIANTU) as WariantKoloru[]).map((w) => (
        <li key={w} className="flex flex-col gap-1">
          <div className="flex h-24 items-center justify-center rounded-[8px] border border-line p-3" style={{ background: TLO_WARIANTU[w](projekt) }}>
            <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} uklad={uklad} wariant={w} tlo={false} className="h-full w-full" />
          </div>
          <span className="text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">{ETYKIETY_WARIANTU[w].nazwa}</span> · {ETYKIETY_WARIANTU[w].opis}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Logo w kontekstach: nagłówek strony, karta przeglądarki (favicon 16/32), wizytówka. */
export function KontekstyLogo({ projekt, nazwa, podpis, kontakt }: { projekt: ProjektLogo; nazwa: string; podpis?: string; kontakt?: Marka['kontakt'] }) {
  const p = projekt.kolory.paleta;
  useFonty([
    { rodzina: projekt.fonty.tekst, waga: 400 },
    { rodzina: projekt.fonty.naglowki, waga: 600 },
  ]);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <figure className="m-0 flex flex-col gap-1">
        <div className="overflow-hidden rounded-[8px] border border-line" style={{ background: p.tlo, color: p.tekst, fontFamily: stosFontuPanelu(projekt.fonty.tekst) }}>
          <div className="flex items-center gap-3 border-b px-3 py-2.5" style={{ borderColor: p.linia }}>
            <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} wysokoscPx={30} className="h-8 min-w-0 justify-start" />
            <span className="ml-auto hidden gap-3 text-[12px] sm:flex" aria-hidden>
              <span>Oferta</span>
              <span>Cennik</span>
              <span>Kontakt</span>
            </span>
            <span className="flex-none rounded-[5px] px-2.5 py-1 text-[12px] font-semibold" style={{ background: p.akcent, color: p.naAkcencie }} aria-hidden>
              Napisz
            </span>
          </div>
          <div className="px-3 py-4" aria-hidden>
            <p className="m-0 text-[18px] font-semibold leading-tight" style={{ fontFamily: stosFontuPanelu(projekt.fonty.naglowki) }}>
              {nazwa}
            </p>
            <p className="m-0 mt-1 text-[12px]" style={{ color: p.tekstPrzygaszony }}>
              Kreator stron weźmie logo, kolory i kroje z tej marki.
            </p>
          </div>
        </div>
        <figcaption className="text-[12px] text-muted-foreground">Nagłówek strony</figcaption>
      </figure>
      <div className="flex flex-col gap-3">
        <figure className="m-0 flex flex-col gap-1">
          <div className="flex items-center gap-3 rounded-[8px] border border-line bg-raised px-3 py-2.5">
            <FaviconNaZywo projekt={projekt} nazwa={nazwa} rozmiar={16} />
            <FaviconNaZywo projekt={projekt} nazwa={nazwa} rozmiar={32} />
            <FaviconNaZywo projekt={projekt} nazwa={nazwa} rozmiar={32} kafel />
            <span className="min-w-0 break-words rounded-[6px] bg-card px-2 py-1 text-[12px] text-foreground">{nazwa} – strona główna</span>
          </div>
          <figcaption className="text-[12px] text-muted-foreground">Favicon 16 i 32 px, ikona na kafelku</figcaption>
        </figure>
        <figure className="m-0 flex flex-col gap-1">
          <div className="flex aspect-[85/55] w-full max-w-[300px] overflow-hidden rounded-[6px] border border-line bg-[#ffffff] shadow-sm" aria-hidden>
            <div className="flex w-1/2 items-center justify-center p-3" style={{ background: projekt.kolory.glowny }}>
              <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} uklad={projekt.sygnet.typ === 'brak' ? 'napis' : 'pionowy'} wariant="bialy" className="h-full w-full" />
            </div>
            <div className="flex w-1/2 flex-col justify-between p-2.5" style={{ color: '#1E2A24' }}>
              <span>
                <span className="block text-[10px] font-semibold" style={{ fontFamily: stosFontuPanelu(projekt.fonty.naglowki), color: projekt.kolory.glowny }}>
                  {kontakt?.imie || 'Imię Nazwisko'}
                </span>
                <span className="block text-[7.5px]">{kontakt?.stanowisko || 'Stanowisko'}</span>
              </span>
              <span className="block text-[7px] leading-snug">
                {kontakt?.telefon || 'tel. 600 000 000'}
                <br />
                {kontakt?.email || 'kontakt@twoja-domena.pl'}
              </span>
            </div>
          </div>
          <figcaption className="text-[12px] text-muted-foreground">Wizytówka (dane przykładowe – wpiszesz je w Materiałach)</figcaption>
        </figure>
      </div>
    </div>
  );
}

/**
 * Krok „Dopasuj” po wyborze kierunku: podgląd (duże logo, warianty, konteksty) + panel zmian + zapis PUT …/projekt.
 */
export function KrokDopasuj({
  marka,
  onZapisz,
}: {
  marka: Marka;
  onZapisz: (p: ProjektLogo) => Promise<{ blad?: string } | null>;
}) {
  const [projekt, setProjekt] = useState<ProjektLogo>(marka.projekt);
  const [zapis, setZapis] = useState<'brak' | 'trwa' | 'ok'>('brak');
  const [blad, setBlad] = useState<string | null>(null);
  const nazwa = marka.brief.nazwa;
  const podpis = marka.brief.podpis;
  const ocena = useOcena(projekt, nazwa);
  const zmieniony = JSON.stringify(projekt) !== JSON.stringify(marka.projekt);

  const zapisz = async () => {
    setBlad(null);
    setZapis('trwa');
    const w = await onZapisz(projekt);
    if (w?.blad) {
      setBlad(w.blad);
      setZapis('brak');
    } else setZapis('ok');
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="flex h-48 items-center justify-center rounded-[10px] border border-line bg-[#ffffff] p-6 sm:h-56">
            <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} className="h-full w-full" />
          </div>
          <div className="flex h-48 items-center justify-center rounded-[10px] p-6 sm:h-56" style={{ background: projekt.kolory.glowny }}>
            <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} wariant="negatyw" tlo={false} className="h-full w-full" />
          </div>
        </div>
        <section aria-labelledby="dopasuj-warianty" className="flex flex-col gap-2">
          <h2 id="dopasuj-warianty" className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Warianty
          </h2>
          <WariantyLogo projekt={projekt} nazwa={nazwa} podpis={podpis} />
        </section>
        <section aria-labelledby="dopasuj-konteksty" className="flex flex-col gap-2">
          <h2 id="dopasuj-konteksty" className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            W użyciu
          </h2>
          <KontekstyLogo projekt={projekt} nazwa={nazwa} podpis={podpis} kontakt={marka.kontakt} />
        </section>
      </div>
      <aside className="flex flex-col gap-4 rounded-[10px] border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <div>
          <h2 className="m-0 font-display text-[17px] font-bold text-foreground">Dopasuj</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Zmiana koloru, kroju i układu nie zużywa limitu AI.</p>
        </div>
        <PanelDopasuj projekt={projekt} onZmiana={(p) => { setProjekt(p); setZapis('brak'); }} nazwa={nazwa} podpis={podpis} pelny />
        <ListaOceny ocena={ocena} />
        {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap gap-2 border-t border-line bg-card p-4">
          <button type="button" className={klasaPrzyciskuGlownego} disabled={!zmieniony || zapis === 'trwa' || ocena.bledy.length > 0} onClick={() => void zapisz()}>
            {zapis === 'trwa' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Zapisz zmiany
          </button>
          <button type="button" className={klasaPrzyciskuDrugiego} disabled={!zmieniony || zapis === 'trwa'} onClick={() => setProjekt(marka.projekt)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Cofnij
          </button>
          <span role="status" className="self-center text-[12px] text-muted-foreground">
            {zapis === 'ok' && !zmieniony ? 'Zapisano.' : zmieniony ? 'Niezapisane zmiany' : ''}
          </span>
        </div>
      </aside>
    </div>
  );
}

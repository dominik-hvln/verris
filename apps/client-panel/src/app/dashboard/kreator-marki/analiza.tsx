'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, Loader2, Sparkles } from 'lucide-react';
import { hexDoOklch, type StanKreatoraMarki, type WidokMarki } from '@verris/kreator/klient';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import { adresSvg } from '@/lib/kreator';
import { opisPozostalo, pozostaloZ, SCIEZKA_MARKI, type KrokMarki } from '@/lib/kreator-marki';
import { Komunikat, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../kreator/wspolne';
import { kierunkiOdswiezenia, kvPodWgraneLogo } from './akcje';

/**
 * Paczka 131 – analiza wgranego logo (ścieżki „Mam logo – Key Visual” i „Odśwież logo”): oryginał i wersja wektorowa
 * obok siebie (porównaj krawędzie przed drukiem), kolory z udziałem, rozpoznane elementy, problemy (gradient, cień,
 * kontrast, proporcje) i krój podobny z katalogu. Dalej: KV pod logo (POST …/kv-ai) albo 3 kierunki (POST …/odswiezenie).
 */

/** Tylko obraz PNG/JPEG jako data URI (oryginał z API) – nic innego nie trafia do <img src>. */
export function bezpiecznyOryginal(src: string | undefined): string | null {
  return src && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null;
}

const procent = (u: number) => `${Math.round((u <= 1 ? u * 100 : u))}%`;

export function Analiza({
  widok,
  stan,
  onWidok,
  onKrok,
  onStan,
}: {
  widok: WidokMarki;
  stan: StanKreatoraMarki;
  onWidok: (w: WidokMarki) => void;
  onKrok: (k: KrokMarki) => void;
  onStan: () => void;
}) {
  const a = widok.analiza;
  const [trwa, setTrwa] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [polecenie, setPolecenie] = useState('');
  const odswiezenie = widok.zrodlo === 'odswiezenie';

  if (!a) {
    return (
      <Komunikat rodzaj="info" tytul="Brak analizy">
        Ta marka nie ma wgranego logo. <Link href={`${SCIEZKA_MARKI}/wgraj?zrodlo=${widok.zrodlo === 'odswiezenie' ? 'odswiezenie' : 'wgrane'}`}>Wgraj logo</Link>
      </Komunikat>
    );
  }
  const oryginal = bezpiecznyOryginal(a.oryginal);

  const dalej = async () => {
    if (widok.marka && !odswiezenie) {
      onKrok('materialy');
      return;
    }
    if (odswiezenie && widok.serie.length) {
      onKrok('propozycje');
      return;
    }
    setBlad(null);
    setTrwa(true);
    try {
      const w = odswiezenie ? await kierunkiOdswiezenia(widok.id) : await kvPodWgraneLogo(widok.id, polecenie);
      if (!w.ok) {
        setBlad(w.blad);
        return;
      }
      onWidok(w.dane);
      onStan();
      onKrok(odswiezenie ? 'propozycje' : 'materialy');
    } catch {
      setBlad(KOMUNIKAT_PO_AKTUALIZACJI);
    } finally {
      setTrwa(false);
    }
  };

  const brakLimitu = odswiezenie && !widok.serie.length && pozostaloZ(stan.limity.serie) <= 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section aria-labelledby="analiza-tytul" className="flex min-w-0 flex-col gap-4">
        <h2 id="analiza-tytul" className="m-0 font-display text-[20px] font-bold text-foreground">
          Co widzimy w Twoim logo
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <figure className="m-0 flex flex-col gap-1.5">
            <div className="flex h-48 items-center justify-center rounded-[10px] border border-line bg-[#ffffff] p-4">
              {oryginal ? (
                // eslint-disable-next-line @next/next/no-img-element -- oryginał z analizy (data URI PNG z API)
                <img src={oryginal} alt="Twoje logo – oryginał" className="max-h-full w-auto max-w-full" />
              ) : (
                <span className="text-[12px]" style={{ color: '#4B5A53' }}>
                  Podgląd oryginału niedostępny
                </span>
              )}
            </div>
            <figcaption className="text-[12px] text-muted-foreground">Oryginał</figcaption>
          </figure>
          <figure className="m-0 flex flex-col gap-1.5">
            <div className="flex h-48 items-center justify-center rounded-[10px] border border-line bg-[#ffffff] p-4">
              {a.wektorSvg ? (
                // eslint-disable-next-line @next/next/no-img-element -- wektor z API jako obraz (data URI) – <img> nie wykonuje skryptów SVG
                <img src={adresSvg(a.wektorSvg)} alt="Twoje logo – wersja wektorowa" className="max-h-full w-auto max-w-full" />
              ) : (
                <span className="text-[12px]" style={{ color: '#4B5A53' }}>
                  Wersji wektorowej nie udało się odtworzyć
                </span>
              )}
            </div>
            <figcaption className="text-[12px] text-muted-foreground">
              Wektor i elementy{a.zgodnosc !== undefined ? ` · zgodność krawędzi ${procent(a.zgodnosc)}` : ''} – porównaj z oryginałem, zanim oddasz plik do druku.
            </figcaption>
          </figure>
        </div>
        {a.kolory.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Kolory</h3>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {a.kolory.map((k) => {
                const o = hexDoOklch(k.hex);
                return (
                  <li key={k.hex} className="flex items-center gap-2.5 rounded-[8px] border border-line bg-card px-2.5 py-2">
                    <span aria-hidden className="h-8 w-8 rounded-[6px] border border-line" style={{ background: k.hex }} />
                    <span className="text-[12px]">
                      <b className="block font-mono text-foreground">{k.hex.toUpperCase()}</b>
                      <span className="font-mono text-muted-foreground">
                        {procent(k.udzial)} · oklch({o.l.toFixed(2)} {o.c.toFixed(3)} {Math.round(o.h)})
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {a.elementy.length ? (
          <p className="text-[13px] text-foreground">
            <b>Rozpoznane elementy:</b> {a.elementy.join(', ')}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="analiza-wnioski" className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4 sm:p-5">
        <h2 id="analiza-wnioski" className="m-0 font-display text-[18px] font-bold text-foreground">
          Wnioski
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {a.problemy.map((p) => (
            <li key={p} className="flex gap-2 rounded-[8px] bg-raised px-3 py-2 text-[13px] text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warn" aria-hidden />
              {p}
            </li>
          ))}
          {a.krojPodobny ? (
            <li className="flex gap-2 rounded-[8px] bg-raised px-3 py-2 text-[13px] text-foreground">
              <Info className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden />
              Krój podobny z naszego katalogu: {a.krojPodobny} (nie rozpoznajemy kroju – proponujemy krój OFL o podobnym charakterze).
            </li>
          ) : null}
          {!a.problemy.length ? (
            <li className="flex gap-2 rounded-[8px] bg-raised px-3 py-2 text-[13px] text-foreground">
              <Info className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden />
              Nie widzimy problemów z kontrastem ani czytelnością.
            </li>
          ) : null}
        </ul>
        {!odswiezenie && !widok.marka ? (
          <label className="flex flex-col gap-1 text-[12.5px] text-foreground">
            Wskazówka dla asystenta (opcjonalnie)
            <textarea
              className="min-h-[64px] w-full rounded-[7px] border border-line-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
              maxLength={300}
              value={polecenie}
              placeholder="np. spokojne grafiki, dużo bieli"
              onChange={(e) => setPolecenie(e.target.value)}
            />
          </label>
        ) : null}
        {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
        {trwa ? (
          <p role="status" className="text-[12.5px] text-muted-foreground">
            {odswiezenie ? 'Asystent przygotowuje 3 kierunki – to trwa do minuty.' : 'Asystent dobiera paletę, wzór i hasło do Twojego logo.'}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={klasaPrzyciskuGlownego} disabled={trwa || brakLimitu} onClick={() => void dalej()}>
            {trwa ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {odswiezenie ? (widok.serie.length ? 'Pokaż kierunki' : 'Pokaż 3 kierunki') : widok.marka ? 'Dalej: materiały' : 'Zbuduj Key Visual'}
          </button>
          <Link href={`${SCIEZKA_MARKI}/wgraj?zrodlo=${odswiezenie ? 'odswiezenie' : 'wgrane'}`} className={klasaPrzyciskuDrugiego}>
            Wgraj inny plik
          </Link>
        </div>
        {odswiezenie && !widok.serie.length ? <p className="text-[12px] text-muted-foreground">{opisPozostalo(stan.limity.serie, 'serie')}. Kierunki odświeżenia zużywają 1 serię.</p> : null}
      </section>
    </div>
  );
}

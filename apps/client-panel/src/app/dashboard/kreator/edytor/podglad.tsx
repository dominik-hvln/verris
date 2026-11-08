'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { cx } from '@/components/panel/cx';

/** Odświeżenie podglądu po ostatniej zmianie (ms) – szybko, ale bez renderu przy każdym znaku. */
export const ZWLOKA_PODGLADU_MS = 400;
export const SZEROKOSC_KOMPUTER = 1280;
export const SZEROKOSC_TELEFON = 390;
/**
 * Poniżej tej skali widok komputera (1280 px) jest nieczytelny – tekst 16 px wychodzi poniżej 8 px. Podgląd sam
 * przechodzi wtedy na telefon i proponuje widok komputera na pełnym ekranie.
 */
export const PROG_SKALI_KOMPUTERA = 0.5;

/** Który widok naprawdę pokazać w kolumnie o tej szerokości (0 = jeszcze nie zmierzona). */
export function widokPodgladu(urzadzenie: 'komputer' | 'telefon', szerokosc: number): { urzadzenie: 'komputer' | 'telefon'; zaWasko: boolean } {
  const zaWasko = urzadzenie === 'komputer' && szerokosc > 0 && szerokosc / SZEROKOSC_KOMPUTER < PROG_SKALI_KOMPUTERA;
  return { urzadzenie: zaWasko ? 'telefon' : urzadzenie, zaWasko };
}

export type WiadomoscPodgladu =
  | { typ: 'sekcja'; id: string }
  | { typ: 'podstrona'; slug: string; kotwica: string }
  | { typ: 'zewnetrzny' }
  | { typ: 'formularz' };

/** Wiadomość z ramki podglądu (postMessage) – tylko znane kształty, reszta = null. */
export function odczytajWiadomosc(dane: unknown): WiadomoscPodgladu | { typ: 'przewin'; y: number } | null {
  if (!dane || typeof dane !== 'object') return null;
  const d = dane as Record<string, unknown>;
  if (d.zrodlo !== 'verris-podglad') return null;
  if (d.typ === 'przewin' && typeof d.y === 'number' && Number.isFinite(d.y)) return { typ: 'przewin', y: d.y };
  if (d.typ === 'sekcja' && typeof d.id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(d.id)) return { typ: 'sekcja', id: d.id };
  if (d.typ === 'podstrona' && typeof d.slug === 'string') return { typ: 'podstrona', slug: d.slug, kotwica: typeof d.kotwica === 'string' ? d.kotwica : '' };
  if (d.typ === 'zewnetrzny') return { typ: 'zewnetrzny' };
  if (d.typ === 'formularz') return { typ: 'formularz' };
  return null;
}

/**
 * Podgląd na żywo: ukryty formularz POST (`target` = ramka) do trasy panelu /api/kreator/podglad, która renderuje
 * stronę po stronie serwera Next. Ramka ma `sandbox="allow-scripts"` (i CSP sandbox w odpowiedzi) – skrypty strony
 * nie widzą panelu. Kotwica `#id` w adresie formularza przewija do sekcji zaznaczonej na liście; przy zwykłej
 * zmianie treści ramka wraca na ostatnią pozycję przewinięcia.
 */
export function Podglad({
  model,
  podstrona,
  pro,
  zaznaczona,
  przewinDo,
  urzadzenie: wybrane,
  poprawny = true,
  pelnyRozmiar = false,
  onPelnyEkran,
  onWiadomosc,
}: {
  model: unknown;
  /** Model z błędami walidacji nie idzie do podglądu – ramka zostaje przy ostatniej poprawnej wersji. */
  poprawny?: boolean;
  podstrona: string;
  pro: boolean;
  zaznaczona: string | null;
  /** Zmiana `nr` = przewiń do sekcji `id` przy najbliższym odświeżeniu. */
  przewinDo: { id: string; nr: number } | null;
  urzadzenie: 'komputer' | 'telefon';
  /** Okno „pełny ekran”: ramka w skali 100%, przewijana (także w poziomie na telefonie). */
  pelnyRozmiar?: boolean;
  /** Przycisk „pełny ekran” przy automatycznym przejściu na telefon. */
  onPelnyEkran?: () => void;
  onWiadomosc: (w: WiadomoscPodgladu) => void;
}) {
  // Każda ramka ma własną nazwę – podgląd w kolumnie i na pełnym ekranie mogą istnieć naraz.
  const CEL = `kreator-podglad-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const formularz = useRef<HTMLFormElement>(null);
  const ramka = useRef<HTMLIFrameElement>(null);
  const kontener = useRef<HTMLDivElement>(null);
  const przewin = useRef(0);
  const ostatniaKotwica = useRef<number | null>(null);
  const onWiadomoscRef = useRef(onWiadomosc);
  const [wymiary, setWymiary] = useState({ w: 0, h: 0 });
  const [laduje, setLaduje] = useState(true);

  useEffect(() => {
    onWiadomoscRef.current = onWiadomosc;
  });

  useLayoutEffect(() => {
    const el = kontener.current;
    if (!el) return;
    const zmierz = () => setWymiary({ w: el.clientWidth, h: el.clientHeight });
    zmierz();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(zmierz);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const odbierz = (e: MessageEvent) => {
      // Ramka w sandboxie ma origin „null” – sprawdzamy, że to NASZA ramka, a nie inne okno.
      if (!ramka.current || e.source !== ramka.current.contentWindow) return;
      const w = odczytajWiadomosc(e.data);
      if (!w) return;
      if (w.typ === 'przewin') przewin.current = w.y;
      else onWiadomoscRef.current(w);
    };
    window.addEventListener('message', odbierz);
    return () => window.removeEventListener('message', odbierz);
  }, []);

  useEffect(() => {
    if (!poprawny) return;
    const t = setTimeout(() => {
      const f = formularz.current;
      if (!f) return;
      const kotwica = przewinDo && przewinDo.nr !== ostatniaKotwica.current ? przewinDo.id : null;
      if (przewinDo) ostatniaKotwica.current = przewinDo.nr;
      (f.elements.namedItem('model') as HTMLInputElement).value = JSON.stringify(model);
      (f.elements.namedItem('podstrona') as HTMLInputElement).value = podstrona;
      (f.elements.namedItem('pro') as HTMLInputElement).value = pro ? '1' : '0';
      (f.elements.namedItem('zaznaczona') as HTMLInputElement).value = zaznaczona ?? '';
      (f.elements.namedItem('przewin') as HTMLInputElement).value = kotwica ? '0' : String(Math.round(przewin.current));
      f.action = `/api/kreator/podglad${kotwica ? `#${kotwica}` : ''}`;
      if (kotwica) przewin.current = 0;
      setLaduje(true);
      f.submit();
    }, ZWLOKA_PODGLADU_MS);
    return () => clearTimeout(t);
  }, [model, podstrona, pro, zaznaczona, przewinDo, poprawny]);

  // Zmiana podstrony = początek nowej strony.
  useEffect(() => {
    przewin.current = 0;
  }, [podstrona]);

  const { urzadzenie, zaWasko } = pelnyRozmiar ? { urzadzenie: wybrane, zaWasko: false } : widokPodgladu(wybrane, wymiary.w);
  const szer = urzadzenie === 'komputer' ? SZEROKOSC_KOMPUTER : SZEROKOSC_TELEFON;
  const skala = pelnyRozmiar ? 1 : wymiary.w ? Math.min(1, (wymiary.w - (urzadzenie === 'telefon' ? 32 : 0)) / szer) : 1;
  const wys = pelnyRozmiar
    ? Math.max(400, wymiary.h || 800)
    : urzadzenie === 'komputer'
      ? (wymiary.h || 800) / skala
      : Math.min(844, ((wymiary.h || 800) - 32) / skala);

  return (
    <div className="flex h-full w-full flex-col">
      {zaWasko ? (
        <p className="flex flex-none items-center gap-x-3 border-b border-line bg-card px-3 py-0.5 text-[12.5px] text-muted-foreground md:flex-wrap md:py-1.5" data-podglad-auto-telefon>
          {/* Telefon: widok telefonu jest oczekiwany – wystarczy krótka informacja i przycisk. */}
          <span className="min-w-0 flex-1 md:flex-none">
            <span className="md:hidden">Podgląd na telefonie.</span>
            <span className="max-md:hidden">Za mało miejsca na czytelny widok komputera – pokazujemy telefon.</span>
          </span>
          {onPelnyEkran ? (
            <button type="button" onClick={onPelnyEkran} className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-[6px] px-1 font-medium text-data-hi underline-offset-2 hover:underline md:min-h-0">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Widok komputera<span className="max-md:sr-only"> na pełnym ekranie</span>
            </button>
          ) : null}
        </p>
      ) : null}
    <div
      ref={kontener}
      className={cx(
        'relative min-h-0 w-full flex-1',
        pelnyRozmiar ? 'overflow-auto' : 'overflow-hidden',
        urzadzenie === 'telefon' && 'flex items-start justify-center pt-4',
      )}
      data-urzadzenie={urzadzenie}
    >
      <form ref={formularz} method="post" target={CEL} action="/api/kreator/podglad" className="hidden" aria-hidden>
        <input type="hidden" name="model" />
        <input type="hidden" name="podstrona" />
        <input type="hidden" name="pro" />
        <input type="hidden" name="zaznaczona" />
        <input type="hidden" name="przewin" />
      </form>
      <div
        className={cx('relative origin-top-left', urzadzenie === 'telefon' && 'overflow-hidden rounded-[28px] border-[6px] border-verris-pine shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)]')}
        style={{ width: szer * skala + (urzadzenie === 'telefon' ? 12 : 0), height: wys * skala + (urzadzenie === 'telefon' ? 12 : 0) }}
      >
        <iframe
          ref={ramka}
          name={CEL}
          title="Podgląd strony"
          sandbox="allow-scripts"
          onLoad={() => setLaduje(false)}
          className="block origin-top-left border-0 bg-[#ffffff]"
          style={{ width: szer, height: wys, transform: `scale(${skala})` }}
        />
      </div>
      <div
        className={cx('pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden transition-opacity', laduje ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      >
        <span className="block h-full w-1/3 animate-pulse bg-data" />
      </div>
    </div>
    </div>
  );
}

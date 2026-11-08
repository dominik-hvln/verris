'use client';

import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ExternalLink, ImageIcon, Loader2, Search, Upload } from 'lucide-react';
import type { Obraz } from '@verris/kreator/klient';
import { PanelModal } from '@/components/panel/panel-modal';
import { Checkbox } from '@/components/panel/checkbox';
import { cx } from '@/components/panel/cx';
import { plForm } from '@/lib/pl';
import { Kafelki, Komunikat, Pole, klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../../wspolne';
import { importujZdjecie, listaZasobow, szukajZdjec } from './akcje';
import { MAKS_BAJTOW_ZDJECIA, TYPY_ZDJEC, nazwaLicencji, type DostawcaZdjec, type OdpowiedzBiblioteki, type WynikBiblioteki, type ZasobKreatora } from './typy';

/**
 * Paczka 122 – wybór zdjęcia do obrazu na stronie z kreatora (kontrakt kreator-wspolne-122.md, pkt 5).
 * Zakładki: „Wgraj” (przeciągnij i upuść albo wybór pliku, postęp), „Twoje zdjęcia” (biblioteka konta) i „Biblioteka”
 * (Pixabay, Openverse, Pexels – tylko włączone w API; miniatury przez proxy API). Po wyborze: punkt ostrości (klik
 * albo strzałki), opis alternatywny (wymagany albo „dekoracyjne” = pusty) i podgląd kadru w proporcjach z modelu.
 * `onWybierz` dostaje nowy obiekt Obraz (zasobId, wymiary, ogniskowa, autor, licencja); pozostałe pola zostają.
 */
export interface WyborZdjeciaProps {
  obraz?: Obraz;
  /** Ścieżka obiektu Obraz w modelu (informacyjnie – edytor wie, gdzie wstawić wynik). */
  sciezka: string;
  stronaId?: string;
  otwarty: boolean;
  onWybierz: (obraz: Obraz) => void;
  onZamknij: () => void;
}

type Zakladka = 'wgraj' | 'twoje' | 'biblioteka';
const ZAKLADKI: { id: Zakladka; nazwa: string }[] = [
  { id: 'wgraj', nazwa: 'Wgraj' },
  { id: 'twoje', nazwa: 'Twoje zdjęcia' },
  { id: 'biblioteka', nazwa: 'Biblioteka' },
];

const PROPORCJE: Record<string, string> = { '16:9': '16 / 9', '4:3': '4 / 3', '3:2': '3 / 2', '1:1': '1 / 1', '3:4': '3 / 4', '4:5': '4 / 5' };

export const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(0.1, b / 1048576).toFixed(1).replace('.', ',')} MB`);

/** Odmowa przed wysłaniem (te same reguły sprawdza API po zawartości pliku). */
export function bladPliku(plik: { name: string; size: number; type: string }): string | null {
  const nazwa = plik.name.toLowerCase();
  if (plik.type === 'image/svg+xml' || nazwa.endsWith('.svg')) return 'Pliki SVG nie są obsługiwane – wgraj zdjęcie w JPEG, PNG, WebP albo AVIF.';
  if (/image\/hei[cf]/.test(plik.type) || /\.hei[cf]$/.test(nazwa)) {
    return 'Zdjęcia HEIC (iPhone) nie są obsługiwane. Zapisz zdjęcie jako JPEG – na iPhonie: Ustawienia → Aparat → Formaty → Najbardziej zgodne.';
  }
  if (plik.type && !(TYPY_ZDJEC as readonly string[]).includes(plik.type)) return 'Ten plik nie jest obsługiwanym zdjęciem. Wgraj JPEG, PNG, WebP albo AVIF.';
  if (plik.size > MAKS_BAJTOW_ZDJECIA) return `Zdjęcie jest za duże (${mb(plik.size)}, limit ${MAKS_BAJTOW_ZDJECIA / 1048576} MB).`;
  if (plik.size === 0) return 'Plik jest pusty.';
  return null;
}

/** Plik wariantu do podglądu w dialogu (≤ 960 px; mniejsze oryginały mają tylko 480). */
const podgladZasobu = (z: ZasobKreatora) => `${z.adres}${z.szerokosc >= 960 ? 960 : 480}.webp`;

export function WyborZdjecia({ otwarty, onZamknij, ...reszta }: WyborZdjeciaProps) {
  return (
    <PanelModal open={otwarty} onClose={onZamknij} title="Wybierz zdjęcie" className="max-h-[92vh] max-w-3xl overflow-y-auto">
      <Tresc {...reszta} onZamknij={onZamknij} />
    </PanelModal>
  );
}

function Tresc({ obraz, stronaId, onWybierz, onZamknij }: Omit<WyborZdjeciaProps, 'otwarty' | 'sciezka'>) {
  const [zakladka, setZakladka] = useState<Zakladka>('wgraj');
  const [wybrany, setWybrany] = useState<ZasobKreatora | null>(null);
  const id = useId();
  const refy = useRef<(HTMLButtonElement | null)[]>([]);

  if (wybrany) {
    return <Kadr zasob={wybrany} obraz={obraz} onWroc={() => setWybrany(null)} onGotowe={(o) => { onWybierz(o); onZamknij(); }} />;
  }

  const klawisz = (e: KeyboardEvent, i: number) => {
    const n = ZAKLADKI.length;
    const nast = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (nast < 0) return;
    e.preventDefault();
    setZakladka(ZAKLADKI[nast]!.id);
    refy.current[nast]?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Skąd wziąć zdjęcie" className="flex gap-1 border-b border-line">
        {ZAKLADKI.map((z, i) => (
          <button
            key={z.id}
            ref={(el) => {
              refy.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${z.id}`}
            aria-selected={zakladka === z.id}
            aria-controls={`${id}-panel-${z.id}`}
            tabIndex={zakladka === z.id ? 0 : -1}
            onClick={() => setZakladka(z.id)}
            onKeyDown={(e) => klawisz(e, i)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              zakladka === z.id ? 'border-data text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {z.nazwa}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel-${zakladka}`} aria-labelledby={`${id}-tab-${zakladka}`}>
        {zakladka === 'wgraj' ? <Wgraj stronaId={stronaId} onWgrane={setWybrany} /> : null}
        {zakladka === 'twoje' ? <TwojeZdjecia onWybierz={setWybrany} /> : null}
        {zakladka === 'biblioteka' ? <Biblioteka podpowiedz={obraz?.opisDoWyszukania ?? ''} stronaId={stronaId} onZaimportowane={setWybrany} /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Wgraj
// ---------------------------------------------------------------------------------------------------------------

function Wgraj({ stronaId, onWgrane }: { stronaId?: string; onWgrane: (z: ZasobKreatora) => void }) {
  const [blad, setBlad] = useState<string | null>(null);
  const [postep, setPostep] = useState<number | null>(null);
  const [nad, setNad] = useState(false);
  const idPola = useId();

  const wyslij = (plik: File) => {
    const b = bladPliku(plik);
    setBlad(b);
    if (b) return;
    const dane = new FormData();
    dane.append('plik', plik);
    if (stronaId) dane.append('stronaId', stronaId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/kreator/zasoby');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPostep(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setPostep(null);
      const odp = (xhr.response ?? {}) as { zasob?: ZasobKreatora; message?: unknown };
      if (xhr.status === 200 && odp.zasob) onWgrane(odp.zasob);
      else setBlad(typeof odp.message === 'string' && odp.message ? odp.message : 'Nie udało się wgrać zdjęcia – spróbuj ponownie.');
    };
    xhr.onerror = () => {
      setPostep(null);
      setBlad('Nie udało się wgrać zdjęcia – sprawdź połączenie i spróbuj ponownie.');
    };
    setPostep(0);
    xhr.send(dane);
  };

  const upusc = (e: DragEvent) => {
    e.preventDefault();
    setNad(false);
    const plik = e.dataTransfer.files?.[0];
    if (plik) wyslij(plik);
  };

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={idPola}
        onDragOver={(e) => {
          e.preventDefault();
          setNad(true);
        }}
        onDragLeave={() => setNad(false)}
        onDrop={upusc}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed px-4 py-10 text-center focus-within:ring-2 focus-within:ring-data/40',
          nad ? 'border-data bg-data-soft' : 'border-line-strong bg-raised hover:border-data',
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">Przeciągnij zdjęcie tutaj albo kliknij, żeby wybrać plik</span>
        <span className="text-[12px] text-muted-foreground">JPEG, PNG, WebP albo AVIF, do {MAKS_BAJTOW_ZDJECIA / 1048576} MB. Dane z aparatu (np. lokalizację) usuwamy.</span>
        <input
          id={idPola}
          type="file"
          accept={TYPY_ZDJEC.join(',')}
          className="sr-only"
          disabled={postep !== null}
          onChange={(e) => {
            const plik = e.target.files?.[0];
            e.target.value = '';
            if (plik) wyslij(plik);
          }}
        />
      </label>
      {postep !== null ? (
        <div className="flex flex-col gap-1">
          <div role="progressbar" aria-label="Wgrywanie zdjęcia" aria-valuemin={0} aria-valuemax={100} aria-valuenow={postep} className="h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-data transition-[width]" style={{ width: `${postep}%` }} />
          </div>
          <span className="text-[12px] text-muted-foreground" aria-live="polite">
            {postep < 100 ? `Wgrywanie… ${postep}%` : 'Przygotowujemy zdjęcie w kilku rozmiarach…'}
          </span>
        </div>
      ) : null}
      {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Siatka miniatur (listbox z obsługą strzałek)
// ---------------------------------------------------------------------------------------------------------------

interface Kafel {
  id: string;
  src: string;
  alt: string;
  podpis?: ReactNode;
}

function Siatka({ etykieta, kafle, zaznaczony, onZaznacz, onWybierz }: { etykieta: string; kafle: Kafel[]; zaznaczony: string | null; onZaznacz: (id: string) => void; onWybierz: (id: string) => void }) {
  const lista = useRef<HTMLDivElement>(null);
  const aktywny = Math.max(0, kafle.findIndex((k) => k.id === zaznaczony));
  const kolumny = () => {
    const s = lista.current ? getComputedStyle(lista.current).gridTemplateColumns : '';
    const n = s ? s.split(' ').filter(Boolean).length : 0;
    return n > 0 ? n : 4;
  };
  const klawisz = (e: KeyboardEvent, i: number) => {
    let nast = -1;
    if (e.key === 'ArrowRight') nast = i + 1;
    else if (e.key === 'ArrowLeft') nast = i - 1;
    else if (e.key === 'ArrowDown') nast = i + kolumny();
    else if (e.key === 'ArrowUp') nast = i - kolumny();
    else if (e.key === 'Home') nast = 0;
    else if (e.key === 'End') nast = kafle.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onWybierz(kafle[i]!.id);
      return;
    }
    if (nast < 0 || nast >= kafle.length) return;
    e.preventDefault();
    onZaznacz(kafle[nast]!.id);
    (lista.current?.querySelectorAll<HTMLElement>('[role="option"]')[nast])?.focus();
  };
  return (
    <div ref={lista} role="listbox" aria-label={etykieta} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {kafle.map((k, i) => (
        <div
          key={k.id}
          role="option"
          aria-selected={k.id === zaznaczony}
          tabIndex={i === aktywny ? 0 : -1}
          onClick={() => onZaznacz(k.id)}
          onDoubleClick={() => onWybierz(k.id)}
          onKeyDown={(e) => klawisz(e, i)}
          className={cx(
            'group flex cursor-pointer flex-col gap-1 rounded-[8px] border p-1 outline-none focus-visible:ring-2 focus-visible:ring-data/50',
            k.id === zaznaczony ? 'border-data bg-data-soft' : 'border-line hover:border-line-strong',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- adres API (podpisany), bez optymalizacji Next */}
          <img src={k.src} alt={k.alt} loading="lazy" className="aspect-[4/3] w-full rounded-[6px] bg-raised object-cover" />
          {k.podpis ? <span className="break-words px-0.5 text-[11.5px] leading-snug text-muted-foreground">{k.podpis}</span> : null}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Twoje zdjęcia
// ---------------------------------------------------------------------------------------------------------------

function TwojeZdjecia({ onWybierz }: { onWybierz: (z: ZasobKreatora) => void }) {
  const [zasoby, setZasoby] = useState<ZasobKreatora[] | null>(null);
  const [razem, setRazem] = useState(0);
  const [strona, setStrona] = useState(1);
  const [miejsce, setMiejsce] = useState<{ zajete: number; limit: number } | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [zaznaczony, setZaznaczony] = useState<string | null>(null);
  const [laduje, setLaduje] = useState(false);

  // Stan ustawiamy dopiero w odpowiedzi (then) – efekt startowy nie wywołuje kaskady renderów (react-hooks/set-state-in-effect).
  const przyjmij = useCallback((w: Awaited<ReturnType<typeof listaZasobow>>, s: number) => {
    setLaduje(false);
    if (!w.ok) {
      setBlad(w.blad);
      return;
    }
    setBlad(null);
    setZasoby((poprzednie) => (s === 1 ? w.dane.zasoby : [...(poprzednie ?? []), ...w.dane.zasoby]));
    setRazem(w.dane.razem);
    setMiejsce(w.dane.miejsce);
    setStrona(s);
  }, []);

  const laduj = (s: number) => listaZasobow(s).then((w) => przyjmij(w, s));

  useEffect(() => {
    let aktualny = true;
    void listaZasobow(1).then((w) => {
      if (aktualny) przyjmij(w, 1);
    });
    return () => {
      aktualny = false;
    };
  }, [przyjmij]);

  if (blad) return <Komunikat rodzaj="blad">{blad}</Komunikat>;
  if (!zasoby) return <Ladowanie tekst="Wczytujemy Twoje zdjęcia…" />;
  if (!zasoby.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nie masz jeszcze zdjęć w bibliotece. Wgraj zdjęcie albo wybierz je z biblioteki.</p>;
  }
  const wybrany = zasoby.find((z) => z.id === zaznaczony) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Siatka
        etykieta="Twoje zdjęcia"
        kafle={zasoby.map((z) => ({ id: z.id, src: z.miniatura, alt: z.alt ?? '', podpis: `${z.szerokosc} × ${z.wysokosc} px` }))}
        zaznaczony={zaznaczony}
        onZaznacz={setZaznaczony}
        onWybierz={(id) => onWybierz(zasoby.find((z) => z.id === id)!)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          {razem} {plForm(razem, 'zdjęcie', 'zdjęcia', 'zdjęć')}
          {miejsce ? ` · zajęte ${mb(miejsce.zajete)} z ${mb(miejsce.limit)}` : ''}
        </span>
        {zasoby.length < razem ? (
          <button
            type="button"
            className={klasaPrzyciskuDrugiego}
            disabled={laduje}
            onClick={() => {
              setLaduje(true);
              void laduj(strona + 1);
            }}
          >
            Pokaż więcej
          </button>
        ) : null}
      </div>
      <div className="flex justify-end">
        <button type="button" className={klasaPrzyciskuGlownego} disabled={!wybrany} onClick={() => wybrany && onWybierz(wybrany)}>
          Użyj
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Biblioteka (Pixabay, Openverse, Pexels)
// ---------------------------------------------------------------------------------------------------------------

function Biblioteka({ podpowiedz, stronaId, onZaimportowane }: { podpowiedz: string; stronaId?: string; onZaimportowane: (z: ZasobKreatora) => void }) {
  const [q, setQ] = useState(podpowiedz);
  const [dostawca, setDostawca] = useState<DostawcaZdjec | null>(null);
  const [odp, setOdp] = useState<OdpowiedzBiblioteki | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [szuka, setSzuka] = useState(true);
  const [importuje, setImportuje] = useState(false);
  const [zaznaczony, setZaznaczony] = useState<string | null>(null);

  const przyjmij = useCallback((w: Awaited<ReturnType<typeof szukajZdjec>>) => {
    setSzuka(false);
    if (!w.ok) {
      setBlad(w.blad);
      return;
    }
    setOdp(w.dane);
    setDostawca(w.dane.dostawca);
    setZaznaczony(null);
  }, []);

  const szukaj = (fraza: string, d: DostawcaZdjec | null, strona = 1) => {
    setSzuka(true);
    setBlad(null);
    return szukajZdjec({ q: fraza, ...(d ? { dostawca: d } : {}), strona }).then(przyjmij);
  };

  useEffect(() => {
    let aktualny = true;
    void szukajZdjec({ q: podpowiedz, strona: 1 }).then((w) => {
      if (aktualny) przyjmij(w);
    });
    return () => {
      aktualny = false;
    };
  }, [przyjmij, podpowiedz]);

  const uzyj = async (w: WynikBiblioteki) => {
    if (!dostawca) return;
    setImportuje(true);
    setBlad(null);
    const r = await importujZdjecie({ dostawca, id: w.id, ...(stronaId ? { stronaId } : {}) });
    setImportuje(false);
    if (!r.ok) setBlad(r.blad);
    else onZaimportowane(r.dane.zasob);
  };

  if (odp && !odp.dostawcy.length) return <Komunikat>Biblioteki zdjęć są teraz niedostępne. Wgraj własne zdjęcie.</Komunikat>;
  const wybrany = odp?.wyniki.find((w) => w.id === zaznaczony) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void szukaj(q, dostawca);
        }}
      >
        <label className="sr-only" htmlFor="kreator-szukaj-zdjec">
          Szukaj zdjęć
        </label>
        <input id="kreator-szukaj-zdjec" className={klasaPola} value={q} maxLength={100} placeholder="np. wnętrze salonu fryzjerskiego" onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className={klasaPrzyciskuDrugiego} disabled={szuka}>
          <Search className="h-3.5 w-3.5" aria-hidden /> Szukaj
        </button>
      </form>
      {odp && odp.dostawcy.length > 1 ? (
        <Kafelki
          etykieta="Biblioteka zdjęć"
          ukryjEtykiete
          kolumny="grid-cols-3"
          wartosc={dostawca}
          opcje={odp.dostawcy.map((d) => ({ wartosc: d.id, nazwa: d.nazwa }))}
          onZmiana={(d) => void szukaj(q, d)}
        />
      ) : null}
      {podpowiedz ? <p className="text-[12px] text-muted-foreground">Podpowiedź z projektu strony: „{podpowiedz}”.</p> : null}
      {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
      {szuka || !odp ? (
        <Ladowanie tekst="Szukamy zdjęć…" />
      ) : !q.trim() ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Wpisz, czego szukasz – najlepiej kilka słów.</p>
      ) : !odp.wyniki.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nic nie znaleźliśmy – spróbuj innych słów albo innej biblioteki.</p>
      ) : (
        <>
          <p className="text-[12px] text-muted-foreground">
            Zdjęcia z {odp.zrodlo ?? 'biblioteki'} · {odp.razem} {plForm(odp.razem, 'wynik', 'wyniki', 'wyników')}. Wybrane zdjęcie skopiujemy na Twoją stronę.
          </p>
          <Siatka
            etykieta={`Zdjęcia z ${odp.zrodlo ?? 'biblioteki'}`}
            kafle={odp.wyniki.map((w) => ({ id: w.id, src: w.miniatura, alt: '', podpis: w.autor }))}
            zaznaczony={zaznaczony}
            onZaznacz={setZaznaczony}
            onWybierz={(id) => void uzyj(odp.wyniki.find((w) => w.id === id)!)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-muted-foreground">
              {wybrany ? (
                <>
                  Autor: {wybrany.autor} · {nazwaLicencji(wybrany.licencja)} ·{' '}
                  <a href={wybrany.zrodloUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                    źródło <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </>
              ) : (
                'Zaznacz zdjęcie, żeby zobaczyć autora i licencję.'
              )}
            </span>
            <div className="flex gap-2">
              {odp.strona > 1 ? (
                <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => void szukaj(q, dostawca, odp.strona - 1)}>
                  Poprzednie
                </button>
              ) : null}
              {odp.strona * odp.naStrone < odp.razem && odp.strona < 20 ? (
                <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => void szukaj(q, dostawca, odp.strona + 1)}>
                  Następne
                </button>
              ) : null}
              <button type="button" className={klasaPrzyciskuGlownego} disabled={!wybrany || importuje} onClick={() => wybrany && void uzyj(wybrany)}>
                {importuje ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Użyj
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Ladowanie({ tekst }: { tekst: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {tekst}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Kadr: punkt ostrości, alt, podgląd przycięcia
// ---------------------------------------------------------------------------------------------------------------

const ograniczenie = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

function Kadr({ zasob, obraz, onWroc, onGotowe }: { zasob: ZasobKreatora; obraz?: Obraz; onWroc: () => void; onGotowe: (o: Obraz) => void }) {
  const [ogniskowa, setOgniskowa] = useState(obraz?.zasobId === zasob.id && obraz.ogniskowa ? obraz.ogniskowa : { x: 0.5, y: 0.5 });
  const [alt, setAlt] = useState(zasob.alt ?? (obraz?.alt || ''));
  const [dekoracyjne, setDekoracyjne] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const proporcje = obraz?.proporcje ?? '4:3';
  const src = podgladZasobu(zasob);
  const pozycja = `${Math.round(ogniskowa.x * 100)}% ${Math.round(ogniskowa.y * 100)}%`;
  const zewnetrzne = zasob.zrodlo === 'pixabay' || zasob.zrodlo === 'openverse' || zasob.zrodlo === 'pexels';

  const klawisz = (e: KeyboardEvent) => {
    const krok = e.shiftKey ? 0.1 : 0.05;
    const d = { ArrowLeft: [-krok, 0], ArrowRight: [krok, 0], ArrowUp: [0, -krok], ArrowDown: [0, krok] }[e.key];
    if (!d) return;
    e.preventDefault();
    setOgniskowa((o) => ({ x: ograniczenie(o.x + d[0]!), y: ograniczenie(o.y + d[1]!) }));
  };

  const gotowe = () => {
    const opis = alt.trim();
    if (!dekoracyjne && !opis) {
      setBlad('Opisz, co widać na zdjęciu, albo zaznacz, że jest tylko dekoracją.');
      return;
    }
    // Zdjęcie z biblioteki zastępuje dawny plik spod `url` (renderer bierze warianty z zasobu).
    const baza: Obraz = { ...(obraz ?? { alt: '', zrodlo: 'placeholder', proporcje: '4:3' }) };
    delete baza.url;
    onGotowe({
      ...baza,
      alt: dekoracyjne ? '' : opis.slice(0, 200),
      zrodlo: zasob.zrodlo,
      zasobId: zasob.id,
      szerokosc: zasob.szerokosc,
      wysokosc: zasob.wysokosc,
      ogniskowa,
      proporcje,
      autor: zewnetrzne && zasob.autor ? zasob.autor.slice(0, 120) : undefined,
      licencja: zewnetrzne && zasob.licencja ? zasob.licencja : undefined,
      licencjaUrl: zewnetrzne && zasob.licencjaUrl ? zasob.licencjaUrl : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground" id="kreator-ogniskowa">
            Najważniejszy punkt zdjęcia
          </span>
          <div
            role="slider"
            aria-labelledby="kreator-ogniskowa"
            aria-valuetext={`${Math.round(ogniskowa.x * 100)}% od lewej, ${Math.round(ogniskowa.y * 100)}% od góry`}
            aria-valuenow={Math.round(ogniskowa.x * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onKeyDown={klawisz}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (!r.width || !r.height) return;
              setOgniskowa({ x: ograniczenie((e.clientX - r.left) / r.width), y: ograniczenie((e.clientY - r.top) / r.height) });
            }}
            className="relative cursor-crosshair overflow-hidden rounded-[8px] border border-line outline-none focus-visible:ring-2 focus-visible:ring-data/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- adres API (podpisany), bez optymalizacji Next */}
            <img src={src} alt="" className="block w-full" draggable={false} />
            <span
              aria-hidden
              className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,.5)]"
              style={{ left: `${ogniskowa.x * 100}%`, top: `${ogniskowa.y * 100}%` }}
            />
          </div>
          <span className="text-[12px] text-muted-foreground">Kliknij w miejsce, które ma zostać w kadrze (albo użyj strzałek).</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground">Podgląd kadru ({proporcje})</span>
          <div className="overflow-hidden rounded-[8px] border border-line bg-raised" style={{ aspectRatio: PROPORCJE[proporcje] ?? '4 / 3' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- adres API (podpisany), bez optymalizacji Next */}
            <img src={src} alt="" data-kadr className="h-full w-full object-cover" style={{ objectPosition: pozycja }} />
          </div>
          {zewnetrzne ? (
            <span className="text-[12px] text-muted-foreground">
              {zasob.autor ? `Autor: ${zasob.autor} · ` : ''}
              {nazwaLicencji(zasob.licencja)}
              {zasob.zrodloUrl ? (
                <>
                  {' · '}
                  <a href={zasob.zrodloUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    źródło
                  </a>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      <Pole
        etykieta="Opis zdjęcia (alt)"
        podpowiedz="Co widać na zdjęciu – np. „Fryzjerka strzyże klientkę przy oknie”. Czytają to czytniki ekranu i wyszukiwarki."
        blad={blad}
        licznik={dekoracyjne ? null : { ile: alt.length, max: 200 }}
      >
        {(a) => (
          <input
            {...a}
            className={klasaPola}
            value={dekoracyjne ? '' : alt}
            disabled={dekoracyjne}
            maxLength={200}
            onChange={(e) => {
              setAlt(e.target.value);
              setBlad(null);
            }}
          />
        )}
      </Pole>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox
          checked={dekoracyjne}
          onChange={(e) => {
            setDekoracyjne(e.target.checked);
            setBlad(null);
          }}
        />
        Zdjęcie jest tylko dekoracją (czytniki ekranu je pominą)
      </label>
      <div className="flex justify-between gap-2">
        <button type="button" className={klasaPrzyciskuDrugiego} onClick={onWroc}>
          Wróć
        </button>
        <button type="button" className={klasaPrzyciskuGlownego} onClick={gotowe}>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Użyj zdjęcia
        </button>
      </div>
    </div>
  );
}

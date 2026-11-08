'use client';

import { useId } from 'react';
import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Select } from '@/components/panel/select';
import { Checkbox } from '@/components/panel/checkbox';
import { Switch } from '@/components/panel/v2';
import { nettoZBrutto, zl } from '@/lib/kreator';
import { ETYKIETY, ETYKIETY_WYBOROW, POZYCJA_LISTY, pobierz, przesun, wartoscDomyslna, type OpisPola, type PoleObiektu, type Sciezka } from './schemat';
import { Pole, klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuIkony } from '../wspolne';
import { PoleZdjecia } from './zdjecia/pole-zdjecia';

/**
 * Formularz danych sekcji wygenerowany z opisu schematu (schemat.ts → polaSekcji). Każde pole zna swoją ścieżkę
 * w modelu strony, więc zmiana trafia od razu do modelu (`onZmiana(sciezka, wartosc)`), a błąd walidacji
 * (walidujWEdytorze) pokazuje się przy właściwym polu.
 */
export interface KontekstFormularza {
  model: unknown;
  bledy: Map<string, string>;
  onZmiana: (sciezka: Sciezka, wartosc: unknown) => void;
}

const etykieta = (klucz: string) => ETYKIETY[klucz] ?? klucz;
const blad = (k: KontekstFormularza, s: Sciezka) => k.bledy.get(s.join('.')) ?? null;

const PODPOWIEDZI: Record<string, string> = {
  cel: 'Sekcja na stronie (#kontakt), adres https://…, tel:+48600000000 albo mailto:adres@firma.pl.',
  wyroznienie: 'Fragment, który musi wystąpić w nagłówku – zostanie wyróżniony kolorem albo kursywą.',
  cena: 'Tylko cena, którą podajesz Ty. Zostaw puste, jeśli nie chcesz jej pokazywać.',
  slug: 'Małe litery, cyfry i myślniki, np. jak-dbac-o-wlosy.',
  alt: 'Co widać na zdjęciu – czytają to czytniki ekranu i wyszukiwarki.',
};

export function FormularzPol({ pola, sciezka, k }: { pola: PoleObiektu[]; sciezka: Sciezka; k: KontekstFormularza }) {
  const maCeneBrutto = pola.some((p) => p.klucz === 'cenaBrutto');
  return (
    <div className="flex flex-col gap-4">
      {pola.map((p) => {
        // Netto prowadzi pole ceny brutto (podpowiedź i opcjonalne netto dla firm) – osobno go nie pokazujemy.
        if (p.klucz === 'cenaNetto' && maCeneBrutto) return null;
        if (p.klucz === 'cenaBrutto') return <PoleCeny key={p.klucz} pole={p} sciezka={sciezka} k={k} />;
        return <PoleModelu key={p.klucz} pole={p} sciezka={[...sciezka, p.klucz]} k={k} />;
      })}
    </div>
  );
}

function PoleModelu({ pole, sciezka, k, bezRamki = false }: { pole: PoleObiektu; sciezka: Sciezka; k: KontekstFormularza; bezRamki?: boolean }) {
  const wartosc = pobierz(k.model, sciezka);
  const { opis, klucz } = pole;
  const nazwa = `${etykieta(klucz)}${pole.opcjonalne && opis.rodzaj === 'tekst' && !opis.wymagane ? ' (opcjonalnie)' : ''}`;
  switch (opis.rodzaj) {
    case 'tekst':
      return <PoleTekstu nazwa={nazwa} opis={opis} klucz={klucz} wartosc={wartosc} sciezka={sciezka} k={k} />;
    case 'liczba':
      return (
        <Pole etykieta={nazwa} blad={blad(k, sciezka)}>
          {(a) => (
            <input
              {...a}
              type="number"
              inputMode={opis.calkowita ? 'numeric' : 'decimal'}
              min={opis.min ?? undefined}
              max={opis.max ?? undefined}
              step={opis.calkowita ? 1 : 0.01}
              className={klasaPola}
              value={typeof wartosc === 'number' ? wartosc : ''}
              onChange={(e) => k.onZmiana(sciezka, e.target.value === '' ? (pole.opcjonalne ? undefined : 0) : Number(e.target.value))}
            />
          )}
        </Pole>
      );
    case 'logiczne':
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-foreground" aria-hidden>
            {nazwa}
          </span>
          <Switch label={nazwa} checked={wartosc === true} onChange={(v) => k.onZmiana(sciezka, v)} />
        </div>
      );
    case 'wybor':
      return <PoleWyboru nazwa={nazwa} opcje={opis.opcje} wartosc={typeof wartosc === 'string' ? wartosc : (pole.domyslna as string) ?? ''} onZmiana={(v) => k.onZmiana(sciezka, v)} blad={blad(k, sciezka)} />;
    case 'wybory':
      return <PoleWyborow nazwa={nazwa} opcje={opis.opcje} max={opis.max} wartosc={Array.isArray(wartosc) ? (wartosc as string[]) : []} onZmiana={(v) => k.onZmiana(sciezka, v)} />;
    case 'lista':
      return <PoleListy nazwa={etykieta(klucz)} klucz={klucz} opis={opis} sciezka={sciezka} k={k} />;
    case 'obraz':
      return <PoleObrazu nazwa={etykieta(klucz)} opcjonalne={pole.opcjonalne} sciezka={sciezka} k={k} bezRamki={bezRamki} />;
    case 'przycisk':
      return <PolePrzycisku nazwa={etykieta(klucz)} opcjonalne={pole.opcjonalne} sciezka={sciezka} k={k} bezRamki={bezRamki} />;
    case 'obiekt':
      if (pole.opcjonalne && (wartosc === undefined || wartosc === null)) {
        return (
          <button type="button" className={`${klasaPrzyciskuDrugiego} self-start`} onClick={() => k.onZmiana(sciezka, wartoscDomyslna(opis, klucz))}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Dodaj: {etykieta(klucz).toLocaleLowerCase('pl-PL')}
          </button>
        );
      }
      return (
        <fieldset className="flex flex-col gap-3 rounded-[8px] border border-line p-3">
          <legend className="px-1 text-[13px] font-medium text-foreground">{etykieta(klucz)}</legend>
          <FormularzPol pola={opis.pola} sciezka={sciezka} k={k} />
          {pole.opcjonalne ? (
            <button type="button" className={`${klasaPrzyciskuDrugiego} self-start`} onClick={() => k.onZmiana(sciezka, undefined)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Usuń: {etykieta(klucz).toLocaleLowerCase('pl-PL')}
            </button>
          ) : null}
        </fieldset>
      );
  }
}

function PoleTekstu({
  nazwa,
  opis,
  klucz,
  wartosc,
  sciezka,
  k,
}: {
  nazwa: string;
  opis: Extract<OpisPola, { rodzaj: 'tekst' }>;
  klucz: string;
  wartosc: unknown;
  sciezka: Sciezka;
  k: KontekstFormularza;
}) {
  const tekst = typeof wartosc === 'string' ? wartosc : '';
  const zmien = (v: string) => k.onZmiana(sciezka, !opis.wymagane && v === '' ? undefined : v);
  const licznik = opis.max !== null && opis.max >= 40 && !opis.data ? { ile: tekst.length, max: opis.max } : null;
  return (
    <Pole etykieta={nazwa} blad={blad(k, sciezka)} licznik={licznik} podpowiedz={PODPOWIEDZI[klucz]}>
      {(a) =>
        opis.dlugi ? (
          <textarea {...a} data-sciezka={sciezka.join('.')} className={`${klasaPola} min-h-[84px] resize-y`} value={tekst} onChange={(e) => zmien(e.target.value)} maxLength={opis.max ?? undefined} />
        ) : (
          <input {...a} data-sciezka={sciezka.join('.')} type={opis.data ? 'date' : 'text'} className={klasaPola} value={tekst} onChange={(e) => zmien(e.target.value)} maxLength={opis.max ?? undefined} />
        )
      }
    </Pole>
  );
}

function PoleWyboru({ nazwa, opcje, wartosc, onZmiana, blad: b }: { nazwa: string; opcje: string[]; wartosc: string; onZmiana: (v: string) => void; blad: string | null }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {nazwa}
      </label>
      <Select id={id} value={wartosc} onChange={onZmiana} options={opcje.map((o) => ({ value: o, label: ETYKIETY_WYBOROW[o] ?? o }))} aria-invalid={!!b} />
      {b ? <p className="text-[12px] font-medium text-crit">{b}</p> : null}
    </div>
  );
}

function PoleWyborow({ nazwa, opcje, max, wartosc, onZmiana }: { nazwa: string; opcje: string[]; max: number | null; wartosc: string[]; onZmiana: (v: string[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[13px] font-medium text-foreground">{nazwa}</legend>
      <div className="grid grid-cols-2 gap-2">
        {opcje.map((o) => {
          const zaznaczona = wartosc.includes(o);
          return (
            <label key={o} className="flex items-center gap-2 text-[13px] text-foreground">
              <Checkbox
                checked={zaznaczona}
                disabled={!zaznaczona && max !== null && wartosc.length >= max}
                onChange={(e) => onZmiana(e.target.checked ? opcje.filter((x) => x === o || wartosc.includes(x)) : wartosc.filter((x) => x !== o))}
              />
              {ETYKIETY_WYBOROW[o] ?? o}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PoleListy({ nazwa, klucz, opis, sciezka, k }: { nazwa: string; klucz: string; opis: Extract<OpisPola, { rodzaj: 'lista' }>; sciezka: Sciezka; k: KontekstFormularza }) {
  const lista = (pobierz(k.model, sciezka) as unknown[] | undefined) ?? [];
  const pozycja = POZYCJA_LISTY[klucz] ?? 'pozycję';
  const Pozycja = pozycja.charAt(0).toUpperCase() + pozycja.slice(1).replace(/ę$/, 'a');
  const pelna = opis.max !== null && lista.length >= opis.max;
  const bladListy = blad(k, sciezka);
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1 flex w-full items-baseline justify-between gap-2 text-[13px] font-medium text-foreground">
        {nazwa}
        <span className="font-mono text-[11.5px] font-normal text-muted-foreground">
          {lista.length}
          {opis.max !== null ? `/${opis.max}` : ''}
        </span>
      </legend>
      {bladListy ? <p className="text-[12px] font-medium text-crit">{bladListy}</p> : null}
      {lista.map((_, i) => {
        const s = [...sciezka, i];
        const tytul = `${Pozycja} ${i + 1}`;
        return (
          <div key={i} className="flex flex-col gap-3 rounded-[8px] border border-line bg-background/40 p-3">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-[12.5px] font-semibold text-muted-foreground">{tytul}</span>
              <button type="button" className={klasaPrzyciskuIkony} aria-label={`${tytul}: przenieś wyżej`} disabled={i === 0} onClick={() => k.onZmiana(sciezka, przesun(lista, i, i - 1))}>
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" className={klasaPrzyciskuIkony} aria-label={`${tytul}: przenieś niżej`} disabled={i === lista.length - 1} onClick={() => k.onZmiana(sciezka, przesun(lista, i, i + 1))}>
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" className={klasaPrzyciskuIkony} aria-label={`${tytul}: usuń`} disabled={lista.length <= opis.min} onClick={() => k.onZmiana(sciezka, lista.filter((__, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            {opis.element.rodzaj === 'obiekt' ? (
              <FormularzPol pola={opis.element.pola} sciezka={s} k={k} />
            ) : (
              <PoleModelu pole={{ klucz: klucz === 'akapity' ? 'tresc' : klucz === 'cechy' ? 'tekst' : klucz, opis: opis.element, opcjonalne: false }} sciezka={s} k={k} bezRamki />
            )}
          </div>
        );
      })}
      <button
        type="button"
        className={`${klasaPrzyciskuDrugiego} self-start`}
        disabled={pelna}
        onClick={() => k.onZmiana(sciezka, [...lista, wartoscDomyslna(opis.element, klucz)])}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Dodaj {pozycja}
      </button>
      {pelna ? <p className="text-[12px] text-muted-foreground">To już najwięcej w tej sekcji.</p> : null}
    </fieldset>
  );
}

/** Grupa pól z legendą; w pozycji listy (już podpisanej „Przycisk 2”) – bez drugiej ramki i legendy. */
function Ramka({ nazwa, bezRamki, children }: { nazwa: string; bezRamki: boolean; children: React.ReactNode }) {
  if (bezRamki) return <div className="flex flex-col gap-3">{children}</div>;
  return (
    <fieldset className="flex flex-col gap-3 rounded-[8px] border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-foreground">{nazwa}</legend>
      {children}
    </fieldset>
  );
}

const PROPORCJE = ['16:9', '4:3', '3:2', '1:1', '3:4', '4:5'];

function PoleObrazu({ nazwa, opcjonalne, sciezka, k, bezRamki = false }: { nazwa: string; opcjonalne: boolean; sciezka: Sciezka; k: KontekstFormularza; bezRamki?: boolean }) {
  const obraz = pobierz(k.model, sciezka) as (Parameters<typeof PoleZdjecia>[0]['obraz'] & { alt?: string }) | undefined;
  if (!obraz) {
    return (
      <div className="flex flex-col gap-2 rounded-[8px] border border-dashed border-line-strong p-3">
        <span className="text-[13px] font-medium text-foreground">{nazwa}</span>
        <button type="button" className={`${klasaPrzyciskuDrugiego} self-start`} onClick={() => k.onZmiana(sciezka, { alt: '', zrodlo: 'placeholder', proporcje: '4:3' })}>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Dodaj miejsce na zdjęcie
        </button>
      </div>
    );
  }
  return (
    <Ramka nazwa={nazwa} bezRamki={bezRamki}>
      {/* Paczka 122 – wybór zdjęcia (wgranie, biblioteka konta, biblioteki zewnętrzne): zdjecia/wybor-zdjecia.tsx. */}
      <PoleZdjecia obraz={obraz} sciezka={sciezka.join('.')} onWybierz={(o) => k.onZmiana(sciezka, o)} />
      <Pole etykieta={ETYKIETY.alt!} podpowiedz={PODPOWIEDZI.alt} blad={blad(k, [...sciezka, 'alt'])} licznik={{ ile: (obraz.alt ?? '').length, max: 200 }}>
        {(a) => <input {...a} className={klasaPola} value={obraz.alt ?? ''} maxLength={200} onChange={(e) => k.onZmiana([...sciezka, 'alt'], e.target.value)} />}
      </Pole>
      <Pole etykieta={`${ETYKIETY.podpis} (opcjonalnie)`} blad={blad(k, [...sciezka, 'podpis'])}>
        {(a) => <input {...a} className={klasaPola} value={obraz.podpis ?? ''} maxLength={120} onChange={(e) => k.onZmiana([...sciezka, 'podpis'], e.target.value || undefined)} />}
      </Pole>
      <PoleWyboru nazwa={ETYKIETY.proporcje!} opcje={PROPORCJE} wartosc={obraz.proporcje ?? '4:3'} onZmiana={(v) => k.onZmiana([...sciezka, 'proporcje'], v)} blad={null} />
      {opcjonalne ? (
        <button type="button" className={`${klasaPrzyciskuDrugiego} self-start`} onClick={() => k.onZmiana(sciezka, undefined)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Usuń zdjęcie z sekcji
        </button>
      ) : null}
    </Ramka>
  );
}

function PolePrzycisku({ nazwa, opcjonalne, sciezka, k, bezRamki = false }: { nazwa: string; opcjonalne: boolean; sciezka: Sciezka; k: KontekstFormularza; bezRamki?: boolean }) {
  const p = pobierz(k.model, sciezka) as { etykieta?: string; cel?: string; styl?: string } | undefined;
  if (!p) {
    return (
      <button type="button" className={`${klasaPrzyciskuDrugiego} self-start`} onClick={() => k.onZmiana(sciezka, { etykieta: 'Skontaktuj się', cel: '#kontakt', styl: 'glowny' })}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Dodaj przycisk
      </button>
    );
  }
  return (
    <Ramka nazwa={nazwa} bezRamki={bezRamki}>
      <Pole etykieta="Napis na przycisku" blad={blad(k, [...sciezka, 'etykieta'])} licznik={{ ile: (p.etykieta ?? '').length, max: 40 }}>
        {(a) => <input {...a} data-sciezka={[...sciezka, 'etykieta'].join('.')} className={klasaPola} value={p.etykieta ?? ''} maxLength={40} onChange={(e) => k.onZmiana([...sciezka, 'etykieta'], e.target.value)} />}
      </Pole>
      <Pole etykieta={ETYKIETY.cel!} podpowiedz={PODPOWIEDZI.cel} blad={blad(k, [...sciezka, 'cel'])}>
        {(a) => <input {...a} className={klasaPola} value={p.cel ?? ''} maxLength={500} onChange={(e) => k.onZmiana([...sciezka, 'cel'], e.target.value)} />}
      </Pole>
      <PoleWyboru nazwa={ETYKIETY.styl!} opcje={['glowny', 'drugi']} wartosc={p.styl ?? 'glowny'} onZmiana={(v) => k.onZmiana([...sciezka, 'styl'], v)} blad={null} />
      {opcjonalne ? (
        <button type="button" className={`${klasaPrzyciskuDrugiego} self-start`} onClick={() => k.onZmiana(sciezka, undefined)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Usuń przycisk
        </button>
      ) : null}
    </Ramka>
  );
}

/** Cena brutto (z „wyceną indywidualną”, gdy schemat pozwala na null) + podpowiedź netto i opcjonalne netto dla firm. */
function PoleCeny({ pole, sciezka, k }: { pole: PoleObiektu; sciezka: Sciezka; k: KontekstFormularza }) {
  const s = [...sciezka, 'cenaBrutto'];
  const sNetto = [...sciezka, 'cenaNetto'];
  const brutto = pobierz(k.model, s);
  const netto = pobierz(k.model, sNetto);
  const opis = pole.opis.rodzaj === 'liczba' ? pole.opis : null;
  const indywidualna = brutto === null;
  const ustawBrutto = (v: number | null) => {
    k.onZmiana(s, v);
    // Netto dla firm podąża za brutto, jeśli klient je włączył.
    if (typeof netto === 'number') k.onZmiana(sNetto, v === null ? undefined : nettoZBrutto(v));
  };
  return (
    <div className="flex flex-col gap-2">
      <Pole
        etykieta={ETYKIETY.cenaBrutto!}
        blad={blad(k, s)}
        podpowiedz={typeof brutto === 'number' ? `Netto: ${zl(nettoZBrutto(brutto))} (brutto / 1,23).` : indywidualna ? 'Na stronie: „wycena indywidualna”.' : undefined}
      >
        {(a) => (
          <input
            {...a}
            data-sciezka={s.join('.')}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            disabled={indywidualna}
            className={klasaPola}
            value={typeof brutto === 'number' ? brutto : ''}
            onChange={(e) => ustawBrutto(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
          />
        )}
      </Pole>
      {opis?.pustaDozwolona ? (
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <Checkbox checked={indywidualna} onChange={(e) => ustawBrutto(e.target.checked ? null : 0)} />
          Wycena indywidualna (bez ceny)
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-[13px] text-foreground">
        <Checkbox
          checked={typeof netto === 'number'}
          disabled={typeof brutto !== 'number'}
          onChange={(e) => k.onZmiana(sNetto, e.target.checked && typeof brutto === 'number' ? nettoZBrutto(brutto) : undefined)}
        />
        Pokaż też cenę netto (dla firm)
      </label>
    </div>
  );
}

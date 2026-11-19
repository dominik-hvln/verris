'use client';

import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Upload } from 'lucide-react';
import type { WidokMarki } from '@verris/kreator/klient';
import { Checkbox } from '@/components/panel/checkbox';
import { cx } from '@/components/panel/cx';
import {
  ADRES_WGRYWANIA,
  AKCEPTOWANE_LOGO,
  adresMarki,
  bladPlikuLogo,
  komunikatBledu,
  SCIEZKA_MARKI,
  TEKST_OSWIADCZENIA_PRAW,
} from '@/lib/kreator-marki';
import { Komunikat, Pole, klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../../kreator/wspolne';

type Zrodlo = 'wgrane' | 'odswiezenie';

/** Pola multipart wg kontraktu POST /kreator-marki/wgraj: plik, zrodlo, oswiadczenie='tak', nazwa?, branza?. */
export function daneWgrania(p: { plik: File; zrodlo: Zrodlo; oswiadczenie: boolean; nazwa: string; branza: string }): FormData {
  const f = new FormData();
  f.append('zrodlo', p.zrodlo);
  if (p.oswiadczenie) f.append('oswiadczenie', 'tak');
  if (p.nazwa.trim()) f.append('nazwa', p.nazwa.trim().slice(0, 60));
  if (p.branza.trim()) f.append('branza', p.branza.trim().slice(0, 80));
  f.append('plik', p.plik, p.plik.name);
  return f;
}

/**
 * Paczka 131 – wgranie logo: przeciągnij i upuść albo przycisk (pole pliku ukryte – strażnik bez-systemowych-list),
 * limit MB ze stanu konta, typy SVG/PDF/PNG/JPG, obowiązkowe oświadczenie o prawach (projekt prawny, sekcja 6 pkt 3).
 * XMLHttpRequest pokazuje postęp; trasa panelu przekazuje plik strumieniem do API, które od razu analizuje logo.
 */
export function WgrywanieLogo({ zrodlo, maksMb, blokada }: { zrodlo: Zrodlo; maksMb: number; blokada: string | null }) {
  const router = useRouter();
  const id = useId();
  const pole = useRef<HTMLInputElement | null>(null);
  const [plik, setPlik] = useState<File | null>(null);
  const [podglad, setPodglad] = useState<string | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [branza, setBranza] = useState('');
  const [oswiadczenie, setOswiadczenie] = useState(false);
  const [nadPolem, setNadPolem] = useState(false);
  const [postep, setPostep] = useState<number | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    if (!plik || plik.type === 'application/pdf' || /\.pdf$/i.test(plik.name)) return;
    const url = URL.createObjectURL(plik);
    // podgląd w <img> (SVG w obrazku nie wykonuje skryptów)
    const t = setTimeout(() => setPodglad(url), 0);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(url);
    };
  }, [plik]);

  const wybierz = (f: File | null | undefined) => {
    if (!f) return;
    const b = bladPlikuLogo(f, maksMb);
    setBlad(b);
    setPodglad(null);
    setPlik(b ? null : f);
  };

  const upusc = (e: DragEvent) => {
    e.preventDefault();
    setNadPolem(false);
    wybierz(e.dataTransfer.files?.[0]);
  };

  const wyslij = () => {
    if (!plik || !oswiadczenie || postep !== null || blokada) return;
    setBlad(null);
    setPostep(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', ADRES_WGRYWANIA);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPostep(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const tresc = xhr.response as unknown;
      if (xhr.status >= 200 && xhr.status < 300 && tresc && typeof (tresc as WidokMarki).id === 'string') {
        router.push(adresMarki((tresc as WidokMarki).id, 'analiza'));
        return;
      }
      setPostep(null);
      setBlad(komunikatBledu(tresc, 'Nie udało się wgrać logo – spróbuj ponownie.'));
    };
    xhr.onerror = () => {
      setPostep(null);
      setBlad('Nie udało się wgrać logo – sprawdź połączenie i spróbuj ponownie.');
    };
    xhr.send(daneWgrania({ plik, zrodlo, oswiadczenie, nazwa, branza }));
  };

  const wysylanie = postep !== null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setNadPolem(true);
          }}
          onDragLeave={() => setNadPolem(false)}
          onDrop={upusc}
          className={cx(
            'flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-dashed p-5 text-center transition-colors',
            nadPolem ? 'border-data bg-data-soft' : 'border-line-strong bg-card',
          )}
        >
          {plik && podglad ? (
            <span className="flex w-full max-w-md items-center justify-center rounded-[8px] bg-[#ffffff] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- podgląd pliku z dysku (adres blob:) */}
              <img src={podglad} alt="Podgląd wybranego logo" className="max-h-40 w-auto max-w-full" />
            </span>
          ) : (
            <FileUp className="h-8 w-8 text-muted-foreground" aria-hidden />
          )}
          <p className="m-0 text-[14px] font-semibold text-foreground">{plik ? plik.name : 'Przeciągnij tu plik z logo'}</p>
          <p className="m-0 text-[12.5px] text-muted-foreground">SVG, PDF, PNG lub JPG do {maksMb} MB · najlepiej SVG albo PDF</p>
          <input
            ref={pole}
            id={`${id}-plik`}
            type="file"
            accept={AKCEPTOWANE_LOGO}
            hidden
            onChange={(e) => {
              wybierz(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => pole.current?.click()} disabled={wysylanie}>
            <Upload className="h-4 w-4" aria-hidden /> {plik ? 'Wybierz inny plik' : 'Wybierz plik'}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-card p-4 sm:p-5">
        <h2 className="m-0 font-display text-[18px] font-bold text-foreground">O firmie (opcjonalnie)</h2>
        <Pole etykieta="Nazwa firmy" podpowiedz="Jeśli zostawisz puste – odczytamy ją z logo.">
          {(a) => <input {...a} className={klasaPola} value={nazwa} maxLength={60} onChange={(e) => setNazwa(e.target.value)} />}
        </Pole>
        <Pole etykieta="Branża">
          {(a) => <input {...a} className={klasaPola} value={branza} maxLength={80} onChange={(e) => setBranza(e.target.value)} />}
        </Pole>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-warn/40 bg-warn-soft px-3 py-2.5 text-[13px] leading-snug text-foreground">
          <Checkbox className="mt-0.5 h-5 w-5" checked={oswiadczenie} onChange={(e) => setOswiadczenie(e.target.checked)} required aria-required="true" />
          <span>{TEKST_OSWIADCZENIA_PRAW}</span>
        </label>
        {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
        {blokada ? <Komunikat rodzaj="ostrzezenie">{blokada}</Komunikat> : null}
        {wysylanie ? (
          <div role="status" className="flex flex-col gap-1.5 text-[12.5px] text-muted-foreground">
            <span>{postep !== null && postep < 100 ? `Wysyłanie… ${postep}%` : 'Analizujemy logo – kolory, elementy i wersja wektorowa. To trwa do minuty.'}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-raised">
              <span className="block h-full bg-data transition-[width]" style={{ width: `${postep ?? 0}%` }} />
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={klasaPrzyciskuGlownego} onClick={wyslij} disabled={!plik || !oswiadczenie || wysylanie || !!blokada}>
            {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Analizuj logo
          </button>
          <Link href={SCIEZKA_MARKI} className={klasaPrzyciskuDrugiego}>
            Wróć
          </Link>
        </div>
        {!oswiadczenie && plik ? <p className="text-[12px] text-muted-foreground">Zaznacz oświadczenie o prawach do logo, żeby przejść dalej.</p> : null}
      </section>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { ImageOff, Loader2, Lock, Sparkles } from 'lucide-react';
import type { DaneKontaktoweMarki, Marka, MaterialKv, StanKreatoraMarki, UstawieniaKv, WidokMarki } from '@verris/kreator/klient';
import { Switch } from '@/components/panel/v2';
import { cx } from '@/components/panel/cx';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import { adresMaterialu, ETYKIETY_MATERIALOW, MATERIALY_PODGLADU, opisPozostalo, pozostaloZ, type KrokMarki } from '@/lib/kreator-marki';
import { listaZasobow } from '../kreator/edytor/zdjecia/akcje';
import type { ZasobKreatora } from '../kreator/edytor/zdjecia/typy';
import { Kafelki, Komunikat, Pole, klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../kreator/wspolne';
import { drobnaZmiana, zapiszKontakt, zapiszKv } from './akcje';

/**
 * Paczka 131 – materiały Key Visual: wzór z sygnetu (gęstość), hasło na grafikach (+ „Zaproponuj hasło” – drobna zmiana
 * AI, limit zmian), tło w kolorze marki albo jasne, zdjęcie z biblioteki Kreatora stron (nigdy w logo – licencje
 * zdjęć), dane do wizytówki i stopki. Podglądy renderuje API (GET …/material/:m.svg przez trasę panelu).
 */

/** Hasło z odpowiedzi drobnej zmiany AI ({ haslo } albo pierwsza wartość). */
export function hasloZWyniku(wynik: Record<string, string>): string | null {
  const h = wynik.haslo ?? Object.values(wynik)[0];
  return typeof h === 'string' && h.trim() ? h.trim().slice(0, 80) : null;
}

/** Klucz podglądów – zmienia się z wersją marki i ustawieniami KV (przeglądarka nie pokaże starego obrazka z pamięci). */
export function kluczPodgladu(w: Pick<WidokMarki, 'wersja'>, m: Pick<Marka, 'kv' | 'kontakt' | 'projekt'>): string {
  const s = JSON.stringify([m.kv, m.kontakt, m.projekt]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${w.wersja}-${(h >>> 0).toString(36)}`;
}

function Podglad({ markaId, material, klucz, zablokowany }: { markaId: string; material: MaterialKv; klucz: string; zablokowany: boolean }) {
  const [blad, setBlad] = useState(false);
  const opis = ETYKIETY_MATERIALOW[material];
  const szeroki = material === 'okladka-facebook' || material === 'baner-linkedin' || material === 'papier-firmowy' || material === 'zaproszenie-teams';
  return (
    <figure className={cx('m-0 flex flex-col gap-1.5', szeroki && 'sm:col-span-2')}>
      <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-[8px] border border-line bg-raised">
        {blad ? (
          <span className="flex flex-col items-center gap-1 p-6 text-[12px] text-muted-foreground">
            <ImageOff className="h-5 w-5" aria-hidden /> Podgląd chwilowo niedostępny
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- podgląd SVG z API przez trasę panelu (bez skryptów w <img>)
          <img
            key={klucz}
            src={adresMaterialu(markaId, material, 'svg', klucz)}
            alt={`Podgląd: ${opis.nazwa}`}
            loading="lazy"
            className="max-h-[360px] w-auto max-w-full"
            onError={() => setBlad(true)}
          />
        )}
        {zablokowany ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
            <Lock className="h-3 w-3" aria-hidden /> Pakiet marki
          </span>
        ) : null}
      </div>
      <figcaption className="text-[12px] text-muted-foreground">
        <b className="text-foreground">{opis.nazwa}</b> · {opis.opis}
      </figcaption>
    </figure>
  );
}

function WyborZdjecia({ wartosc, onZmiana }: { wartosc: string | undefined; onZmiana: (id: string | undefined) => void }) {
  const [zasoby, setZasoby] = useState<ZasobKreatora[] | null>(null);
  useEffect(() => {
    let aktualny = true;
    void listaZasobow(1)
      .then((w) => {
        if (aktualny) setZasoby(w.ok ? w.dane.zasoby.slice(0, 12) : []);
      })
      .catch(() => {
        if (aktualny) setZasoby([]);
      });
    return () => {
      aktualny = false;
    };
  }, []);
  // Biblioteka zdjęć jest w Kreatorze stron – bez niej (albo bez zdjęć) sekcji nie pokazujemy.
  if (!zasoby?.length) return null;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-[13px] font-medium text-foreground">Zdjęcie na grafikach (opcjonalnie)</legend>
      <p className="-mt-1 text-[12px] text-muted-foreground">Z Twoich zdjęć w Kreatorze stron. Zdjęcie trafia tylko do materiałów – nigdy do logo.</p>
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          aria-pressed={!wartosc}
          onClick={() => onZmiana(undefined)}
          className={cx('flex aspect-square items-center justify-center rounded-[6px] border text-[11px] text-muted-foreground', !wartosc ? 'border-data bg-data-soft' : 'border-line')}
        >
          Bez zdjęcia
        </button>
        {zasoby.map((z) => (
          <button
            key={z.id}
            type="button"
            aria-pressed={wartosc === z.id}
            onClick={() => onZmiana(z.id)}
            className={cx('overflow-hidden rounded-[6px] border-2', wartosc === z.id ? 'border-data' : 'border-transparent')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura z API (podpisany adres) */}
            <img src={z.miniatura} alt={z.alt || 'Zdjęcie z biblioteki'} className="aspect-square w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Materialy({
  widok,
  marka,
  stan,
  onWidok,
  onStan,
  onKrok,
}: {
  widok: WidokMarki;
  marka: Marka;
  stan: StanKreatoraMarki;
  onWidok: (w: WidokMarki) => void;
  onStan: () => void;
  onKrok: (k: KrokMarki) => void;
}) {
  const [kv, setKv] = useState<UstawieniaKv>(marka.kv);
  const [kontakt, setKontakt] = useState<DaneKontaktoweMarki>(marka.kontakt);
  const [trwa, setTrwa] = useState<'kv' | 'kontakt' | 'haslo' | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const zmianKv = JSON.stringify(kv) !== JSON.stringify(marka.kv);
  const zmianKontakt = JSON.stringify(kontakt) !== JSON.stringify(marka.kontakt);
  const klucz = kluczPodgladu(widok, marka);
  const pakietowe = new Set(widok.pliki.filter((p) => p.material && p.blokada === 'PAKIET_WYMAGANY').map((p) => p.material!));

  const zapisz = async (co: 'kv' | 'kontakt') => {
    setBlad(null);
    setInfo(null);
    setTrwa(co);
    try {
      const w = co === 'kv' ? await zapiszKv(widok.id, kv) : await zapiszKontakt(widok.id, czystyKontakt(kontakt));
      if (!w.ok) setBlad(w.blad);
      else {
        onWidok(w.dane);
        setInfo(co === 'kv' ? 'Zapisano ustawienia materiałów.' : 'Zapisano dane kontaktowe.');
      }
    } catch {
      setBlad(KOMUNIKAT_PO_AKTUALIZACJI);
    } finally {
      setTrwa(null);
    }
  };

  const zaproponujHaslo = async () => {
    setBlad(null);
    setTrwa('haslo');
    try {
      const w = await drobnaZmiana(widok.id, { rodzaj: 'haslo' });
      if (!w.ok) setBlad(w.blad);
      else {
        const h = hasloZWyniku(w.dane.wynik);
        if (h) setKv((s) => ({ ...s, haslo: h }));
        onWidok(w.dane.widok);
        onStan();
      }
    } catch {
      setBlad(KOMUNIKAT_PO_AKTUALIZACJI);
    } finally {
      setTrwa(null);
    }
  };

  const ustawKontakt = (k: keyof DaneKontaktoweMarki, v: string) => setKontakt((s) => ({ ...s, [k]: v }));

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 rounded-[10px] border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <div>
          <h2 className="m-0 font-display text-[17px] font-bold text-foreground">Key Visual</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Wzór, kolory i kroje z marki w gotowych formatach. Teksty wpisujesz Ty – AI może zaproponować hasło.</p>
        </div>
        <Pole etykieta="Hasło na grafikach" licznik={{ ile: (kv.haslo ?? '').length, max: 80 }}>
          {(a) => <input {...a} className={klasaPola} value={kv.haslo ?? ''} maxLength={80} onChange={(e) => setKv((s) => ({ ...s, haslo: e.target.value || undefined }))} />}
        </Pole>
        <div className="flex flex-col gap-1">
          <button type="button" className={cx(klasaPrzyciskuDrugiego, 'w-fit')} disabled={trwa !== null || pozostaloZ(stan.limity.zmianyAi) <= 0} onClick={() => void zaproponujHaslo()}>
            {trwa === 'haslo' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            Zaproponuj hasło
          </button>
          <span className="text-[11.5px] text-muted-foreground">{opisPozostalo(stan.limity.zmianyAi, 'zmiany')}.</span>
        </div>
        <Kafelki<UstawieniaKv['wzor']>
          etykieta="Gęstość wzoru"
          wartosc={kv.wzor}
          kolumny="grid-cols-3"
          opcje={[
            { wartosc: 'bez', nazwa: 'Bez wzoru' },
            { wartosc: 'rzadki', nazwa: 'Rzadki' },
            { wartosc: 'gesty', nazwa: 'Gęsty' },
          ]}
          onZmiana={(w) => setKv((s) => ({ ...s, wzor: w }))}
        />
        <div className="flex items-center justify-between gap-2 text-[13px] text-foreground">
          <span>Tło w kolorze marki (ciemne)</span>
          <Switch checked={kv.tloCiemne} onChange={(v) => setKv((s) => ({ ...s, tloCiemne: v }))} label="Tło w kolorze marki" />
        </div>
        <WyborZdjecia wartosc={kv.zdjecieZasobId} onZmiana={(id) => setKv((s) => ({ ...s, zdjecieZasobId: id }))} />
        <button type="button" className={klasaPrzyciskuGlownego} disabled={!zmianKv || trwa !== null} onClick={() => void zapisz('kv')}>
          {trwa === 'kv' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Zapisz i odśwież podglądy
        </button>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="m-0 text-[14px] font-semibold text-foreground">Dane do wizytówki i stopki</h3>
          <p className="-mt-2 text-[12px] text-muted-foreground">Widać je tylko na Twoich materiałach. Każdy użytkownik poczty poprawi swoje imię i stanowisko.</p>
          {(
            [
              ['imie', 'Imię i nazwisko', 'name'],
              ['stanowisko', 'Stanowisko', 'organization-title'],
              ['telefon', 'Telefon', 'tel'],
              ['email', 'E-mail', 'email'],
              ['www', 'Strona www', 'url'],
              ['adres', 'Adres', 'street-address'],
            ] as const
          ).map(([k, etykieta, ac]) => (
            <Pole key={k} etykieta={etykieta}>
              {(a) => <input {...a} className={klasaPola} value={kontakt[k] ?? ''} autoComplete={ac} onChange={(e) => ustawKontakt(k, e.target.value)} />}
            </Pole>
          ))}
          <button type="button" className={klasaPrzyciskuDrugiego} disabled={!zmianKontakt || trwa !== null} onClick={() => void zapisz('kontakt')}>
            {trwa === 'kontakt' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Zapisz dane kontaktowe
          </button>
        </div>
        {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
        {info ? (
          <p role="status" className="text-[12.5px] text-data-hi">
            {info}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <button type="button" className={klasaPrzyciskuGlownego} onClick={() => onKrok('eksport')}>
            Dalej: eksport
          </button>
          <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => onKrok('zasady')}>
            Wróć do zasad marki
          </button>
        </div>
      </aside>
      <section aria-label="Podglądy materiałów" className="grid content-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {MATERIALY_PODGLADU.map((m) => (
          <Podglad key={`${m}-${klucz}`} markaId={widok.id} material={m} klucz={klucz} zablokowany={pakietowe.has(m)} />
        ))}
      </section>
    </div>
  );
}

/** Puste pola kontaktu → brak pola (zod w API: telefon/e-mail mają format, pusty napis byłby błędem). */
export function czystyKontakt(k: DaneKontaktoweMarki): DaneKontaktoweMarki {
  const wynik: DaneKontaktoweMarki = {};
  for (const [kl, v] of Object.entries(k) as [keyof DaneKontaktoweMarki, string | undefined][]) {
    const t = v?.trim();
    if (t) wynik[kl] = t;
  }
  return wynik;
}

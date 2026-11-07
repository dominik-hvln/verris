'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Info, Loader2, Sparkles } from 'lucide-react';
import { generujPalete, KATALOG_STYLOW, TYPY_STRON, type StylProjektu, type TypStrony, type WersjaKreatora } from '@verris/kreator/klient';
import { Stepper } from '@/components/panel/stepper';
import type { NowaStronaKreatora } from '@/lib/kreator';
import { utworzStrone } from '../akcje';
import { Kafelki, Komunikat, Pole, klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego, type OpcjaKafelka } from '../wspolne';

/** Brief przechowywany w sessionStorage pod tym kluczem – „Spróbuj ponownie” po błędzie generowania. */
export const kluczBriefu = (id: string) => `verris-kreator-brief-${id}`;

export const MAX_OPISU = 3000;
const MIN_OPISU = 20;
const MAX_CEN = 2000;

const KROKI = ['Rodzaj strony', 'Dane firmy', 'Opis i styl'] as const;

export const TYPY: Record<TypStrony, { nazwa: string; opis: string; pro?: string }> = {
  wizytowka: { nazwa: 'Wizytówka firmy', opis: 'Jedna strona z najważniejszym: oferta, o firmie, kontakt.' },
  landing: { nazwa: 'Strona sprzedażowa', opis: 'Jedna usługa albo oferta i jedno główne działanie (telefon, zapis).' },
  sklep: { nazwa: 'Sklep lub katalog', opis: 'Produkty z cenami i przyciskiem zakupu.', pro: 'Bez Kreatora Pro strona powstanie z ofertą i cenami zamiast katalogu produktów.' },
  portfolio: { nazwa: 'Portfolio', opis: 'Realizacje i zdjęcia prac, krótko o Tobie i kontakt.' },
  blog: { nazwa: 'Blog', opis: 'Wpisy z datą i czasem czytania, strona o autorze.', pro: 'Bez Kreatora Pro strona powstanie bez sekcji wpisów – dodasz ją po przejściu na Pro.' },
  inna: { nazwa: 'Inna', opis: 'Opiszesz, czego potrzebujesz – AI dobierze układ.' },
};

const TONY: { wartosc: string; nazwa: string; opis: string }[] = [
  { wartosc: 'ciepły', nazwa: 'Ciepły', opis: 'Bliski, ludzki, z troską' },
  { wartosc: 'przyjazny', nazwa: 'Przyjazny', opis: 'Prosto i życzliwie, na „Ty”' },
  { wartosc: 'ekspercki', nazwa: 'Ekspercki', opis: 'Rzeczowo, z wiedzą i konkretem' },
  { wartosc: 'elegancki', nazwa: 'Elegancki', opis: 'Spokojnie, z klasą' },
  { wartosc: 'luksusowy', nazwa: 'Luksusowy', opis: 'Ekskluzywnie i oszczędnie w słowach' },
  { wartosc: 'formalny', nazwa: 'Formalny', opis: 'Na „Pan/Pani”, oficjalnie' },
  { wartosc: 'młodzieżowy', nazwa: 'Młodzieżowy', opis: 'Swobodnie, z energią' },
  { wartosc: 'odważny', nazwa: 'Odważny', opis: 'Mocne hasła, wyraźny charakter' },
];

/** Paleta przykładowa stylu do miniatury (środek pierwszego zakresu barwy, pierwszy charakter). */
export function paletaStylu(s: StylProjektu) {
  const [od, koniec] = s.barwy[0] ?? [150, 150];
  const barwa = od <= koniec ? (od + koniec) / 2 : ((od + koniec + 360) / 2) % 360;
  return generujPalete(barwa, s.charaktery[0] ?? 'jasna');
}

interface Formularz {
  typ: TypStrony | null;
  nazwa: string;
  branza: string;
  obszar: string;
  ulica: string;
  kod: string;
  miasto: string;
  telefon: string;
  email: string;
  godziny: string;
  opis: string;
  ceny: string;
  ton: string | null;
  styl: string | null;
}

const PUSTY: Formularz = {
  typ: null, nazwa: '', branza: '', obszar: '', ulica: '', kod: '', miasto: '', telefon: '', email: '', godziny: '', opis: '', ceny: '', ton: null, styl: null,
};

/** Błędy kroku (klucz pola → komunikat). Te same reguły co schemat Firma i DTO briefu w API. */
export function bledyKroku(krok: number, f: Formularz): Record<string, string> {
  const b: Record<string, string> = {};
  if (krok === 0 && !f.typ) b.typ = 'Wybierz rodzaj strony.';
  if (krok === 1) {
    if (!f.nazwa.trim()) b.nazwa = 'Podaj nazwę firmy.';
    else if (f.nazwa.trim().length > 80) b.nazwa = 'Najwyżej 80 znaków.';
    if (!f.branza.trim()) b.branza = 'Podaj branżę – od niej zależy styl i układ.';
    const adres = [f.ulica, f.kod, f.miasto].map((x) => x.trim());
    if (adres.some(Boolean) && !adres.every(Boolean)) b.adres = 'Podaj ulicę, kod i miasto – albo zostaw adres pusty.';
    if (f.kod.trim() && !/^\d{2}-\d{3}$/.test(f.kod.trim())) b.kod = 'Kod pocztowy w formacie 00-000.';
    if (f.telefon.trim() && !/^\+?[0-9 ]{6,20}$/.test(f.telefon.trim())) b.telefon = 'Same cyfry i spacje, np. 600 000 000 albo +48 600 000 000.';
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) b.email = 'Nieprawidłowy adres e-mail.';
  }
  if (krok === 2) {
    const opis = pelnyOpis(f);
    if (f.opis.trim().length < MIN_OPISU) b.opis = `Napisz co najmniej ${MIN_OPISU} znaków – im konkretniej, tym lepsza strona.`;
    else if (opis.length > MAX_OPISU) b.opis = `Opis razem z godzinami ma ${opis.length} znaków – skróć go do ${MAX_OPISU}.`;
    if (f.ceny.length > MAX_CEN) b.ceny = `Najwyżej ${MAX_CEN} znaków.`;
  }
  return b;
}

/** Godziny otwarcia idą w opisie – AI przepisze je do danych firmy, a kontrola briefu w API je rozpozna. */
function pelnyOpis(f: Formularz): string {
  const g = f.godziny.trim();
  return g ? `${f.opis.trim()}\n\nGodziny otwarcia: ${g}` : f.opis.trim();
}

export function zbudujBrief(f: Formularz): NowaStronaKreatora {
  const firma: Record<string, unknown> = { nazwa: f.nazwa.trim(), branza: f.branza.trim() };
  if (f.obszar.trim()) firma.obszar = f.obszar.trim();
  if (f.ulica.trim() && f.kod.trim() && f.miasto.trim()) firma.adres = { ulica: f.ulica.trim(), kod: f.kod.trim(), miasto: f.miasto.trim() };
  if (f.telefon.trim()) firma.telefon = f.telefon.trim();
  if (f.email.trim()) firma.email = f.email.trim();
  return {
    nazwa: f.nazwa.trim().slice(0, 80),
    brief: {
      opis: pelnyOpis(f),
      typ: f.typ ?? 'wizytowka',
      firma,
      ...(f.ceny.trim() ? { ceny: f.ceny.trim() } : {}),
      ...(f.ton ? { ton: f.ton } : {}),
      ...(f.styl ? { styl: f.styl } : {}),
    },
  };
}

export function KreatorBriefu({ wersja }: { wersja: WersjaKreatora }) {
  const router = useRouter();
  const [krok, setKrok] = useState(0);
  const [f, setF] = useState<Formularz>(PUSTY);
  const [pokazBledy, setPokazBledy] = useState(false);
  const [wysylanie, setWysylanie] = useState(false);
  const [bladWysylki, setBladWysylki] = useState<string | null>(null);
  const idNaglowka = useId();
  const pro = wersja === 'pro';
  const bledy = useMemo(() => (pokazBledy ? bledyKroku(krok, f) : {}), [pokazBledy, krok, f]);
  const zmien = <K extends keyof Formularz>(k: K, v: Formularz[K]) => setF((p) => ({ ...p, [k]: v }));

  const dalej = async () => {
    const b = bledyKroku(krok, f);
    if (Object.keys(b).length) {
      setPokazBledy(true);
      // Fokus na pierwsze pole z błędem (WCAG 3.3.1) – pola mają aria-invalid.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"], [data-blad-kroku]')?.focus());
      return;
    }
    setPokazBledy(false);
    if (krok < KROKI.length - 1) {
      setKrok(krok + 1);
      requestAnimationFrame(() => document.getElementById(idNaglowka)?.focus());
      return;
    }
    setWysylanie(true);
    setBladWysylki(null);
    const dane = zbudujBrief(f);
    const r = await utworzStrone(dane);
    if (!r.ok) {
      setWysylanie(false);
      setBladWysylki(r.blad);
      return;
    }
    try {
      sessionStorage.setItem(kluczBriefu(r.dane.id), JSON.stringify(dane));
    } catch {
      /* tryb prywatny / brak miejsca – „Spróbuj ponownie” odeśle wtedy do formularza */
    }
    router.push(`/dashboard/kreator/${r.dane.id}`);
  };

  const opcjeTypow: OpcjaKafelka<TypStrony>[] = TYPY_STRON.map((t) => ({
    wartosc: t,
    nazwa: TYPY[t].nazwa,
    opis: TYPY[t].pro && !pro ? `${TYPY[t].opis} ${TYPY[t].pro}` : TYPY[t].opis,
    pro: !!TYPY[t].pro,
  }));

  const opcjeStylow: OpcjaKafelka<string>[] = [
    { wartosc: '', nazwa: 'Dobierze AI', opis: 'Styl dopasowany do branży i tonu – najczęściej najlepszy wybór.' },
    ...KATALOG_STYLOW.map((s) => {
      const p = paletaStylu(s);
      return {
        wartosc: s.id,
        nazwa: s.nazwa,
        pro: s.pro,
        opis: s.pro && !pro ? 'Bez Kreatora Pro dobierzemy najbliższy styl darmowy.' : undefined,
        dodatek: (
          <span className="mt-1 flex gap-1" aria-hidden>
            {[p.tlo, p.powierzchnia, p.akcent, p.tekst, p.ciemne].map((k, i) => (
              <span key={i} className="h-4 w-4 rounded-full border border-line" style={{ background: k }} />
            ))}
          </span>
        ),
      };
    }),
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Stepper kroki={KROKI} aktualny={krok} />
      <section className="flex flex-col gap-5 rounded-[10px] border border-line bg-card p-5 sm:p-6" aria-labelledby={idNaglowka}>
        <h2 id={idNaglowka} tabIndex={-1} className="m-0 font-display text-[19px] font-bold text-foreground outline-none">
          {krok === 0 ? 'Jaką stronę budujemy?' : krok === 1 ? 'Dane firmy' : 'Opisz firmę i wybierz styl'}
        </h2>

        {krok === 0 ? (
          <div className="flex flex-col gap-2">
            <Kafelki etykieta="Rodzaj strony" ukryjEtykiete wartosc={f.typ} opcje={opcjeTypow} onZmiana={(t) => zmien('typ', t)} kolumny="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" proZablokowane={!pro} />
            {bledy.typ ? (
              <p className="text-[12px] font-medium text-crit" data-blad-kroku tabIndex={-1}>
                {bledy.typ}
              </p>
            ) : null}
          </div>
        ) : null}

        {krok === 1 ? (
          <div className="flex flex-col gap-4">
            <Komunikat rodzaj="info">
              <span className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden />
                AI nie dopisze danych, których nie podasz – telefonu, adresu ani godzin nie zgadujemy. Pola opcjonalne możesz uzupełnić później w edytorze.
              </span>
            </Komunikat>
            <div className="grid gap-4 sm:grid-cols-2">
              <Pole etykieta="Nazwa firmy" blad={bledy.nazwa}>
                {(a) => <input {...a} className={klasaPola} value={f.nazwa} onChange={(e) => zmien('nazwa', e.target.value)} maxLength={80} autoComplete="organization" required />}
              </Pole>
              <Pole etykieta="Branża" blad={bledy.branza} podpowiedz="Np. salon fryzjerski, biuro rachunkowe, pracownia ceramiki.">
                {(a) => <input {...a} className={klasaPola} value={f.branza} onChange={(e) => zmien('branza', e.target.value)} maxLength={80} required />}
              </Pole>
              <Pole etykieta="Miasto lub dzielnica (opcjonalnie)" podpowiedz="Gdzie działasz – np. „Poznań, Jeżyce” albo „dojazd w promieniu 30 km”.">
                {(a) => <input {...a} className={klasaPola} value={f.obszar} onChange={(e) => zmien('obszar', e.target.value)} maxLength={120} />}
              </Pole>
              <Pole etykieta="Telefon (opcjonalnie)" blad={bledy.telefon}>
                {(a) => <input {...a} className={klasaPola} value={f.telefon} onChange={(e) => zmien('telefon', e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} />}
              </Pole>
              <Pole etykieta="E-mail (opcjonalnie)" blad={bledy.email}>
                {(a) => <input {...a} className={klasaPola} type="email" value={f.email} onChange={(e) => zmien('email', e.target.value)} autoComplete="email" maxLength={120} />}
              </Pole>
              <Pole etykieta="Godziny otwarcia (opcjonalnie)" podpowiedz="Np. pn–pt 9–18, sob 9–14.">
                {(a) => <input {...a} className={klasaPola} value={f.godziny} onChange={(e) => zmien('godziny', e.target.value)} maxLength={200} />}
              </Pole>
            </div>
            <fieldset className="flex flex-col gap-3 rounded-[8px] border border-line p-4">
              <legend className="px-1 text-[13px] font-medium text-foreground">Adres (opcjonalnie)</legend>
              {bledy.adres ? <p className="text-[12px] font-medium text-crit">{bledy.adres}</p> : null}
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1.4fr]">
                <Pole etykieta="Ulica i numer">
                  {(a) => <input {...a} aria-invalid={!!bledy.adres && !f.ulica.trim()} className={klasaPola} value={f.ulica} onChange={(e) => zmien('ulica', e.target.value)} autoComplete="address-line1" maxLength={100} />}
                </Pole>
                <Pole etykieta="Kod pocztowy" blad={bledy.kod}>
                  {(a) => <input {...a} className={klasaPola} value={f.kod} onChange={(e) => zmien('kod', e.target.value)} autoComplete="postal-code" placeholder="00-000" maxLength={6} />}
                </Pole>
                <Pole etykieta="Miasto">
                  {(a) => <input {...a} aria-invalid={!!bledy.adres && !f.miasto.trim()} className={klasaPola} value={f.miasto} onChange={(e) => zmien('miasto', e.target.value)} autoComplete="address-level2" maxLength={60} />}
                </Pole>
              </div>
            </fieldset>
          </div>
        ) : null}

        {krok === 2 ? (
          <div className="flex flex-col gap-5">
            <Pole
              etykieta="Opis firmy i strony"
              blad={bledy.opis}
              licznik={{ ile: f.opis.length, max: MAX_OPISU }}
              podpowiedz="Czym się zajmujesz, dla kogo, co wyróżnia firmę, jak klienci się umawiają. Konkrety dają lepszą stronę niż ogólniki."
            >
              {(a) => <textarea {...a} className={`${klasaPola} min-h-[150px] resize-y`} value={f.opis} onChange={(e) => zmien('opis', e.target.value)} maxLength={MAX_OPISU} />}
            </Pole>
            <Pole
              etykieta="Ceny (opcjonalnie)"
              blad={bledy.ceny}
              licznik={{ ile: f.ceny.length, max: MAX_CEN }}
              podpowiedz="Wpisz usługi i ceny brutto, np. „Strzyżenie damskie – od 90 zł”. AI przepisze je na stronę, ale nigdy nie wymyśli cen."
            >
              {(a) => <textarea {...a} className={`${klasaPola} min-h-[96px] resize-y`} value={f.ceny} onChange={(e) => zmien('ceny', e.target.value)} maxLength={MAX_CEN} />}
            </Pole>
            <Kafelki
              etykieta="Ton komunikacji"
              wartosc={f.ton ?? ''}
              opcje={[{ wartosc: '', nazwa: 'Dobierze AI', opis: 'Ton dopasowany do branży' }, ...TONY]}
              onZmiana={(t) => zmien('ton', t || null)}
              kolumny="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            />
            <Kafelki
              etykieta="Styl strony (opcjonalnie)"
              wartosc={f.styl ?? ''}
              opcje={opcjeStylow}
              onZmiana={(s) => zmien('styl', s || null)}
              kolumny="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              proZablokowane={!pro}
            />
          </div>
        ) : null}

        {bladWysylki ? <Komunikat rodzaj="blad" tytul="Nie udało się zacząć generowania">{bladWysylki}</Komunikat> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {krok > 0 ? (
            <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => { setPokazBledy(false); setKrok(krok - 1); }} disabled={wysylanie}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Wstecz
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={klasaPrzyciskuGlownego} onClick={() => void dalej()} disabled={wysylanie}>
            {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : krok === KROKI.length - 1 ? <Sparkles className="h-4 w-4" aria-hidden /> : null}
            {krok === KROKI.length - 1 ? (wysylanie ? 'Zaczynamy…' : 'Wygeneruj stronę') : 'Dalej'}
            {krok < KROKI.length - 1 ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
          </button>
        </div>
      </section>
    </div>
  );
}

'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, ShoppingBag } from 'lucide-react';
import type { CenaMarki, StanKreatoraMarki, WynikZakupuMarki } from '@verris/kreator/klient';
import { Checkbox } from '@/components/panel/checkbox';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import { zl } from '@/lib/kreator';
import { serii, TEKST_ZGODY_TRESCI_CYFROWEJ, zmianAiMarki } from '@/lib/kreator-marki';
import { plForm } from '@/lib/pl';
import { Kafelki, Komunikat, klasaPrzyciskuGlownego } from '../kreator/wspolne';
import { kupMarke } from './akcje';

/**
 * Paczka 131 – zakup Pakietu marki albo kolejnej marki (jednorazowo, treść cyfrowa): cena brutto i netto, co
 * zawiera, metoda płatności (portfel / karta / BLIK i przelew przez operatora płatności – jak przy Kreatorze Pro),
 * obowiązkowa zgoda na rozpoczęcie dostarczania treści cyfrowej (projekt prawny, sekcja 6 pkt 4) i wynik zakupu.
 * POST /kreator-marki/pakiet | /druga-marka → opłacony (stan) / przekierowanie do płatności / brak środków.
 */
type Metoda = 'portfel' | 'karta' | 'paynow';

type ZawartoscPakietu = NonNullable<StanKreatoraMarki['pakiet']['zawiera']>;

/** Co zawiera zakup – z liczbami z ustawień admina, gdy API je podaje (`pakiet.zawiera`). */
export function zawartoscZakupu(rodzaj: 'pakiet' | 'druga-marka', zawiera?: ZawartoscPakietu): readonly string[] {
  if (rodzaj !== 'pakiet' || !zawiera) return ZAWARTOSC[rodzaj];
  const m = zawiera.aktualizacjeMies;
  return [
    `${serii(zawiera.serie)} propozycji i ${zmianAiMarki(zawiera.zmianyAi)}`,
    ...ZAWARTOSC.pakiet.slice(1, -1),
    m > 0 ? `nowe szablony materiałów przez ${m} ${plForm(m, 'miesiąc', 'miesiące', 'miesięcy')}` : ZAWARTOSC.pakiet[ZAWARTOSC.pakiet.length - 1]!,
  ];
}

const ZAWARTOSC = {
  pakiet: [
    'więcej serii propozycji i zmian AI',
    'grafiki do social mediów: post, story, okładka na Facebooku, baner LinkedIn',
    'wizytówka i papier firmowy – PDF do druku ze spadem',
    'księga znaku PDF z zasadami marki',
    'nowe szablony materiałów w okresie aktualizacji',
  ],
  'druga-marka': ['kolejna marka na koncie', 'propozycje, edycja i eksport jak przy pierwszej marce', 'osobne logo, paleta i materiały'],
} as const;

/** Adres płatności z API: tylko https (albo ścieżka panelu) – nic innego nie trafia do location. */
export function bezpiecznyAdresPlatnosci(url: string): string | null {
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function opisWynikuZakupu(w: WynikZakupuMarki, rodzaj: 'pakiet' | 'druga-marka'): { rodzaj: 'sukces' | 'ostrzezenie'; tekst: string } | null {
  if (w.status === 'oplacony') {
    return { rodzaj: 'sukces', tekst: rodzaj === 'pakiet' ? 'Pakiet marki jest aktywny. Pliki z Pakietu pobierzesz w kroku Eksport.' : 'Gotowe – możesz zacząć kolejną markę.' };
  }
  if (w.status === 'brak-srodkow') return { rodzaj: 'ostrzezenie', tekst: `W portfelu brakuje ${zl(w.brakuje)}. Doładuj portfel albo zapłać kartą.` };
  return null;
}

export function ZakupMarki({
  rodzaj,
  cena,
  paynowDostepny = false,
  zawiera,
  onKupione,
  className,
}: {
  rodzaj: 'pakiet' | 'druga-marka';
  cena: CenaMarki;
  /** Paczka 131 – liczby Pakietu z ustawień admina (opcjonalne w StanKreatoraMarki). */
  zawiera?: ZawartoscPakietu;
  paynowDostepny?: boolean;
  onKupione?: (stan: StanKreatoraMarki) => void;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [metoda, setMetoda] = useState<Metoda>('portfel');
  const [zgoda, setZgoda] = useState(false);
  const [trwa, setTrwa] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<ReturnType<typeof opisWynikuZakupu>>(null);
  const tytul = rodzaj === 'pakiet' ? 'Pakiet marki' : 'Kolejna marka';

  const kup = async () => {
    if (!zgoda || trwa) return;
    setBlad(null);
    setWynik(null);
    setTrwa(true);
    try {
      const w = await kupMarke(rodzaj, metoda, zgoda);
      if (!w.ok) {
        setBlad(w.blad);
        return;
      }
      if (w.dane.status === 'przekierowanie') {
        const adres = bezpiecznyAdresPlatnosci(w.dane.url);
        if (!adres) {
          setBlad('Nie udało się otworzyć płatności – spróbuj innej metody.');
          return;
        }
        window.location.assign(adres);
        return;
      }
      setWynik(opisWynikuZakupu(w.dane, rodzaj));
      if (w.dane.status === 'oplacony') {
        onKupione?.(w.dane.stan);
        router.refresh();
      }
    } catch {
      setBlad(KOMUNIKAT_PO_AKTUALIZACJI);
    } finally {
      setTrwa(false);
    }
  };

  const opcje = [
    { wartosc: 'portfel' as const, nazwa: 'Portfel', opis: 'od razu, ze środków w portfelu' },
    { wartosc: 'karta' as const, nazwa: 'Karta', opis: 'płatność kartą u operatora płatności' },
    ...(paynowDostepny ? [{ wartosc: 'paynow' as const, nazwa: 'BLIK lub przelew', opis: 'przejdziesz do bramki płatności' }] : []),
  ];

  return (
    <section className={className} aria-labelledby={`${id}-tytul`}>
      <div className="flex flex-col gap-3.5">
        <div>
          <h3 id={`${id}-tytul`} className="m-0 flex items-center gap-2 font-display text-[16px] font-bold text-foreground">
            <ShoppingBag className="h-4 w-4 text-data-hi" aria-hidden /> {tytul}
          </h3>
          <p className="mt-1 font-display text-[20px] font-bold tabular-nums text-foreground">
            {zl(cena.brutto)} <span className="text-[12px] font-normal text-muted-foreground">brutto, jednorazowo</span>
          </p>
          <p className="text-[12px] tabular-nums text-muted-foreground">{zl(cena.netto)} netto + 23% VAT · bez abonamentu, pliki zostają u Ciebie</p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {zawartoscZakupu(rodzaj, zawiera).map((z) => (
            <li key={z} className="flex gap-2 text-[13px] text-foreground">
              <Check className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden />
              {z}
            </li>
          ))}
        </ul>
        <Kafelki<Metoda> etykieta="Metoda płatności" wartosc={metoda} opcje={opcje} onZmiana={setMetoda} kolumny="grid-cols-1 sm:grid-cols-3" />
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-line bg-raised px-3 py-2.5 text-[12.5px] leading-snug text-foreground">
          <Checkbox className="mt-0.5 h-5 w-5" checked={zgoda} onChange={(e) => setZgoda(e.target.checked)} aria-describedby={`${id}-zgoda`} />
          <span id={`${id}-zgoda`}>{TEKST_ZGODY_TRESCI_CYFROWEJ}</span>
        </label>
        {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
        {wynik ? (
          <div role="status">
            <Komunikat rodzaj={wynik.rodzaj}>
              {wynik.tekst}
              {wynik.rodzaj === 'ostrzezenie' ? (
                <>
                  {' '}
                  <Link href="/dashboard/billing" className="font-semibold text-foreground underline underline-offset-2">
                    Doładuj portfel
                  </Link>
                </>
              ) : null}
            </Komunikat>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void kup()} disabled={!zgoda || trwa} className={klasaPrzyciskuGlownego}>
            {trwa ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Kupuję – {zl(cena.brutto)} brutto
          </button>
          {!zgoda ? <span className="text-[12px] text-muted-foreground">Zaznacz zgodę, żeby kupić.</span> : null}
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          Faktura jak przy innych usługach Verris. <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Regulamin</a>
        </p>
      </div>
    </section>
  );
}


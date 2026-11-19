'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Palette, Sparkles } from 'lucide-react';
import type { Strona } from '@verris/kreator/klient';
import { Checkbox } from '@/components/panel/checkbox';
import { potwierdz } from '@/components/panel/potwierdz';
import {
  adresSvg,
  markaDoPropozycji,
  opisLiczbyZmian,
  SCIEZKA_KREATORA_MARKI,
  type ElementMarki,
  type MarkaStronyKreatora,
  type OpcjeZastosowaniaMarki,
  type PodgladMarkiKreatora,
  type WidokStronyKreatora,
  type WygladMarki,
  type ZmianaMarki,
} from '@/lib/kreator';
import { markaStrony, odlaczMarke, podgladMarki, zastosujMarke } from '../akcje';
import { Komunikat, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../wspolne';

/**
 * Paczka 130 – sekcja „Marka” w ustawieniach strony (zakładka Motyw). Logo, kolory, fonty i favicon z Kreatora marki
 * trafiają na stronę dopiero po kliknięciu „Użyj marki”: najpierw podgląd zmian (API, dry-run) z wyglądem przed/po
 * i wyborem elementów, potem zapis jako nowa wersja w historii. Nowsza wersja marki = baner z propozycją aktualizacji –
 * nic nie zmienia się samo. Bez marki na koncie – link do Kreatora marki (ukryty, gdy moduł jest wyłączony).
 */

const ETYKIETY: Record<ElementMarki, string> = {
  logo: 'Logo w nagłówku i stopce',
  paleta: 'Kolory marki',
  fonty: 'Fonty marki',
  favicon: 'Favicon (ikona w karcie przeglądarki)',
};
const ELEMENTY = Object.keys(ETYKIETY) as ElementMarki[];

/** Domyślny wybór: wszystko przy pierwszym użyciu; przy aktualizacji – logo i favicon tylko, jeśli strona ich używa. */
export function opcjePoczatkowe(m: MarkaStronyKreatora): OpcjeZastosowaniaMarki {
  const u = m.naStronie?.uzyj;
  return { logo: u ? u.logo : true, paleta: true, fonty: true, favicon: u ? u.favicon : true };
}

function Wyglad({ tytul, w }: { tytul: string; w: WygladMarki }) {
  return (
    <figure className="m-0 flex min-w-0 flex-1 flex-col gap-2 rounded-[8px] border border-line p-2.5">
      <figcaption className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{tytul}</figcaption>
      <div className="flex h-14 items-center rounded-[6px] px-2" style={{ background: w.paleta.tlo, color: w.paleta.tekst }}>
        {w.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- SVG z API jako data URI (po sanitizacji), bez optymalizacji obrazów
          <img src={adresSvg(w.logo)} alt={`Logo: ${w.nazwa}`} className="h-9 w-auto max-w-full" />
        ) : (
          <span className="flex min-w-0 items-center gap-2 break-words text-[13px] font-semibold">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-[6px] text-[12px]" style={{ background: w.paleta.akcent, color: '#fff' }} aria-hidden>
              {w.inicjal}
            </span>
            <span className="min-w-0">{w.nazwa}</span>
          </span>
        )}
      </div>
      <div className="flex gap-1" aria-label="Kolory strony">
        {[w.paleta.tlo, w.paleta.powierzchnia, w.paleta.akcent, w.paleta.tekst, w.paleta.ciemne].map((k, i) => (
          <span key={i} className="h-4 flex-1 rounded-[3px] border border-line" style={{ background: k }} title={k} />
        ))}
      </div>
      <p className="m-0 break-words text-[12px] text-muted-foreground">
        Fonty: {w.fonty.naglowki} / {w.fonty.tekst}
      </p>
    </figure>
  );
}

export function SekcjaMarki({
  id,
  model,
  markaDostepna,
  przedZmiana,
  onZmiana,
}: {
  id: string;
  model: Strona;
  markaDostepna: boolean;
  /** Zapis bieżących zmian edytora przed operacją na serwerze (false = nie zapisano – przerwij). */
  przedZmiana: () => Promise<boolean>;
  /** Model z serwera po zastosowaniu / odłączeniu marki. */
  onZmiana: (w: WidokStronyKreatora, opis: string) => void;
}) {
  const [stan, setStan] = useState<MarkaStronyKreatora | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [otwarty, setOtwarty] = useState(false);
  const [opcje, setOpcje] = useState<OpcjeZastosowaniaMarki>({ logo: true, paleta: true, fonty: true, favicon: true });
  const [podglad, setPodglad] = useState<PodgladMarkiKreatora | null>(null);
  const [laduje, setLaduje] = useState(false);
  const [pracuje, setPracuje] = useState(false);
  const zapytanie = useRef(0);
  const naStronie = model.marka ?? null;

  const odswiez = useCallback(async () => {
    const r = await markaStrony(id);
    if (r.ok) {
      setStan(r.dane);
      setBlad(null);
    } else setBlad(r.blad);
  }, [id]);

  useEffect(() => {
    if (!markaDostepna) return;
    let aktywny = true;
    void markaStrony(id).then((r) => {
      if (!aktywny) return;
      if (r.ok) setStan(r.dane);
      else setBlad(r.blad);
    });
    return () => {
      aktywny = false;
    };
  }, [markaDostepna, id]);

  const marka = stan ? markaDoPropozycji(stan) : null;

  const pobierzPodglad = async (o: OpcjeZastosowaniaMarki) => {
    if (!marka) return;
    const nr = ++zapytanie.current;
    setLaduje(true);
    const r = await podgladMarki(id, marka.markaId, o);
    if (nr !== zapytanie.current) return;
    setLaduje(false);
    if (r.ok) setPodglad(r.dane);
    else {
      setPodglad(null);
      toast.error(r.blad);
    }
  };

  const otworz = async () => {
    if (!stan || !marka) return;
    if (!(await przedZmiana())) {
      toast.error('Popraw zaznaczone pola, zanim użyjesz marki – marka trafia na zapisaną wersję strony.');
      return;
    }
    const o = opcjePoczatkowe(stan);
    setOpcje(o);
    setOtwarty(true);
    await pobierzPodglad(o);
  };

  const przelacz = (e: ElementMarki) => {
    const o = { ...opcje, [e]: !opcje[e] };
    setOpcje(o);
    if (ELEMENTY.some((x) => o[x])) void pobierzPodglad(o);
    else setPodglad(null);
  };

  const zastosuj = async () => {
    if (!marka || pracuje) return;
    if (!(await przedZmiana())) {
      toast.error('Popraw zaznaczone pola, zanim użyjesz marki – marka trafia na zapisaną wersję strony.');
      return;
    }
    setPracuje(true);
    const r = await zastosujMarke(id, marka.markaId, opcje);
    setPracuje(false);
    if (!r.ok) {
      toast.error(r.blad);
      return;
    }
    setOtwarty(false);
    setPodglad(null);
    onZmiana(r.dane, r.dane.zmiany.length ? `Zastosowano markę: ${opisLiczbyZmian(r.dane.zmiany.length)}. Zmianę cofniesz w „Historii wersji”.` : 'Strona ma już te elementy marki.');
    for (const o of r.dane.ostrzezenia) toast.message(o);
    await odswiez();
  };

  const odlacz = async () => {
    if (!(await potwierdz('Na stronie wróci inicjał firmy w nagłówku i stopce oraz ikona z inicjałem. Kolory i fonty zostaną. Zmianę cofniesz w „Historii wersji”.', { tytul: 'Odłączyć logo marki?', akcja: 'Odłącz' }))) return;
    if (!(await przedZmiana())) {
      toast.error('Popraw zaznaczone pola, zanim odłączysz markę.');
      return;
    }
    setPracuje(true);
    const r = await odlaczMarke(id);
    setPracuje(false);
    if (!r.ok) {
      toast.error(r.blad);
      return;
    }
    onZmiana(r.dane, 'Odłączono logo marki – na stronie jest inicjał firmy.');
    if (markaDostepna) await odswiez();
  };

  // Moduł wyłączony i strona bez marki – sekcji nie ma (bez linku do niedostępnego Kreatora marki).
  if (!markaDostepna && !naStronie) return null;

  const starsza = marka?.stan === 'starsza';
  const tytulPrzycisku = !naStronie || marka?.stan === 'inna' ? 'Użyj marki' : starsza ? 'Zaktualizuj stronę' : 'Zmień elementy marki';

  return (
    <section className="mb-6 flex flex-col gap-3 border-b border-line pb-5" aria-labelledby="kr-marka">
      <h3 id="kr-marka" className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <Palette className="h-3.5 w-3.5" aria-hidden /> Marka
      </h3>

      {naStronie ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">
          Strona używa marki „{naStronie.nazwa}” (wersja {naStronie.wersja})
          {naStronie.uzyj.logo ? ' – logo w nagłówku i stopce.' : ' – bez logo w nagłówku.'}
        </p>
      ) : null}

      {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}

      {markaDostepna && stan && !marka ? (
        <Komunikat tytul="Nie masz jeszcze logo">
          Zaprojektuj logo, kolory i fonty w Kreatorze marki – potem jednym kliknięciem użyjesz ich na stronie.{' '}
          <Link href={SCIEZKA_KREATORA_MARKI} className="font-semibold text-foreground underline underline-offset-2">
            Stwórz logo w Kreatorze marki
          </Link>
        </Komunikat>
      ) : null}

      {marka && starsza && !otwarty ? (
        <Komunikat rodzaj="ostrzezenie" tytul="Twoja marka się zmieniła – zaktualizuj stronę">
          Na stronie jest wersja {stan?.naStronie?.wersja} marki „{marka.nazwa}”, a w Kreatorze marki – wersja {marka.wersja}. Strona nie zmienia się sama: zobacz zmiany i zdecyduj.
        </Komunikat>
      ) : null}

      {marka && !otwarty ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={klasaPrzyciskuGlownego} onClick={() => void otworz()} disabled={pracuje}>
            <Sparkles className="h-4 w-4" aria-hidden /> {tytulPrzycisku}
          </button>
        </div>
      ) : null}

      {otwarty && marka ? (
        <div className="flex flex-col gap-3 rounded-[8px] border border-line-strong p-3" role="group" aria-label={`Marka „${marka.nazwa}” – co zastosować`}>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1 text-[12.5px] font-semibold text-foreground">Co zastosować z marki „{marka.nazwa}”</legend>
            {ELEMENTY.map((e) => (
              <label key={e} className="flex min-h-8 items-center gap-2 text-[13px] text-foreground max-md:min-h-11">
                <Checkbox checked={opcje[e]} onChange={() => przelacz(e)} />
                {ETYKIETY[e]}
              </label>
            ))}
          </fieldset>

          <div aria-live="polite" className="flex flex-col gap-2">
            {laduje ? (
              <p className="m-0 flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Przygotowujemy podgląd…
              </p>
            ) : null}
            {!ELEMENTY.some((e) => opcje[e]) ? <p className="m-0 text-[12.5px] text-muted-foreground">Zaznacz co najmniej jeden element.</p> : null}
            {podglad && !laduje ? <ListaZmian zmiany={podglad.zmiany} /> : null}
            {podglad && !laduje
              ? podglad.ostrzezenia.map((o) => (
                  <Komunikat key={o} rodzaj="ostrzezenie">
                    {o}
                  </Komunikat>
                ))
              : null}
          </div>

          {podglad ? (
            <div className="flex gap-2 max-sm:flex-col">
              <Wyglad tytul="Teraz" w={podglad.przed} />
              <Wyglad tytul="Po zmianie" w={podglad.po} />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={klasaPrzyciskuGlownego} onClick={() => void zastosuj()} disabled={pracuje || laduje || !podglad || !ELEMENTY.some((e) => opcje[e])}>
              {pracuje ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null} Zastosuj
            </button>
            <button
              type="button"
              className={klasaPrzyciskuDrugiego}
              onClick={() => {
                zapytanie.current++;
                setOtwarty(false);
                setPodglad(null);
                setLaduje(false);
              }}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : null}

      {naStronie && !otwarty ? (
        <button type="button" className={`${klasaPrzyciskuDrugiego} self-start`} onClick={() => void odlacz()} disabled={pracuje}>
          Odłącz logo marki
        </button>
      ) : null}
    </section>
  );
}

function ListaZmian({ zmiany }: { zmiany: ZmianaMarki[] }) {
  if (!zmiany.length) return <p className="m-0 text-[12.5px] text-muted-foreground">Strona ma już te elementy marki – nic się nie zmieni.</p>;
  return (
    <div>
      <p className="m-0 text-[12.5px] font-semibold text-foreground">Co się zmieni ({opisLiczbyZmian(zmiany.length)}):</p>
      <ul className="m-0 mt-1 list-disc pl-5 text-[12.5px] text-muted-foreground">
        {zmiany.map((z) => (
          <li key={`${z.element}-${z.opis}`}>{z.opis}</li>
        ))}
      </ul>
    </div>
  );
}

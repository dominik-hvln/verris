'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Crosshair, MessageSquarePlus, X } from 'lucide-react';
import { odswiezPoWdrozeniu } from '@verris/ui';
import { createTicketWithFiles } from '@/app/dashboard/support/actions';
import {
  MAX_ZNAKOW_UWAGI,
  RODZAJE_UWAGI,
  bladUwagi,
  czyPokazacZglosUwage,
  numerZgloszenia,
  opisElementu,
  tematUwagi,
  trescUwagi,
  type OpisElementu,
  type RodzajUwagi,
} from '@/lib/uwaga-z-bety';
import { ATRYBUT_POMIN, zrobZrzutStrony } from '@/lib/zrzut-strony';
import { Checkbox } from './checkbox';
import { PanelModal } from './panel-modal';
import { PoleZalacznikow } from './pole-zalacznikow';
import { WskazywanieElementu } from './wskazywanie-elementu';
import { cx } from './cx';

/** Wstrzykiwana przy buildzie (next.config.ts) — w testach i `next dev` bez builda może jej nie być. */
const WERSJA_PANELU = process.env.NEXT_PUBLIC_WERSJA_PANELU ?? '';
/** Schowany przycisk — wygoda jednej przeglądarki (localStorage), nie ustawienie konta. */
const KLUCZ_SCHOWANY = 'verris.zglos-uwage.schowany';

const ZDARZENIE_SCHOWANY = 'verris:zglos-uwage-schowany';
function czytajSchowany(): boolean {
  try {
    return window.localStorage.getItem(KLUCZ_SCHOWANY) === '1';
  } catch {
    return false; // tryb prywatny / zablokowane dane strony — przycisk widoczny
  }
}
function subskrybujSchowany(zmiana: () => void) {
  window.addEventListener('storage', zmiana);
  window.addEventListener(ZDARZENIE_SCHOWANY, zmiana);
  return () => {
    window.removeEventListener('storage', zmiana);
    window.removeEventListener(ZDARZENIE_SCHOWANY, zmiana);
  };
}
function zapiszSchowany(v: boolean) {
  try {
    if (v) window.localStorage.setItem(KLUCZ_SCHOWANY, '1');
    else window.localStorage.removeItem(KLUCZ_SCHOWANY);
  } catch {
    /* jw. — zostaje widoczny */
  }
  window.dispatchEvent(new Event(ZDARZENIE_SCHOWANY));
}

type Zrzut = { stan: 'trwa' } | { stan: 'gotowy'; plik: File; url: string } | { stan: 'brak' };

/**
 * Beta — pływający przycisk „Zgłoś uwagę”. Widzi go tester (zrealizował kod z zaproszenia, GET /me/beta), a przy
 * fladze `beta.zglos-uwage` (Admin → Komunikaty i flagi → Flagi funkcji) każdy klient — o ile konto może zakładać
 * zgłoszenia (subkonto bez „Zgłoszenia: zarządzanie” nie widzi przycisku — API i tak by odmówiło).
 * Stoi nad przyciskiem asystenta (prawy dolny róg) i pod jego oknem (z-40 < z-50); da się go schować do wąskiej
 * zakładki przy prawej krawędzi.
 * Zgłoszenie = zwykłe zgłoszenie (POST /tickets/with-attachments, temat BETA) z blokiem kontekstu, opcjonalnie ze
 * wskazanym elementem strony i zrzutem ekranu z jego ramką. W podglądzie konta przez obsługę API zapisuje je ze
 * źródłem IMPERSONACJA, jak każde zgłoszenie założone w tej sesji.
 */
export function ZglosUwage({
  flagi,
  tester = false,
  mozeZglaszac,
  usluga,
}: {
  flagi: Record<string, boolean>;
  /** Konto zrealizowało kod z zaproszenia do testów (GET /me/beta). */
  tester?: boolean;
  mozeZglaszac: boolean;
  /** Usługa, gdy klient jest na stronie usługi (id z /services = id subskrypcji). */
  usluga?: { id: string; nazwa: string } | null;
}) {
  const [otwarte, setOtwarte] = useState(false);
  const schowany = useSyncExternalStore(subskrybujSchowany, czytajSchowany, () => false);
  const [wskazywanie, setWskazywanie] = useState(false);
  const [element, setElement] = useState<OpisElementu | null>(null);
  const [zrzut, setZrzut] = useState<Zrzut | null>(null);
  const numerZrzutu = useRef(0);

  const ustawSchowany = zapiszSchowany;

  /** Nowy zrzut; wynik starszego (np. sprzed wskazania) jest ignorowany, a jego podgląd zwalniany. */
  const zrob = useCallback((zaznacz: OpisElementu['ramka'] | null) => {
    const nr = ++numerZrzutu.current;
    setZrzut({ stan: 'trwa' });
    void zrobZrzutStrony(zaznacz).then((plik) => {
      if (nr !== numerZrzutu.current) return;
      setZrzut(plik ? { stan: 'gotowy', plik, url: URL.createObjectURL(plik) } : { stan: 'brak' });
    });
  }, []);
  useEffect(
    () => () => {
      if (zrzut?.stan === 'gotowy') URL.revokeObjectURL(zrzut.url);
    },
    [zrzut],
  );

  if (!czyPokazacZglosUwage(flagi, tester) || !mozeZglaszac) return null;

  const otworz = () => {
    setOtwarte(true);
    setElement(null);
    zrob(null);
  };
  const zamknij = () => {
    numerZrzutu.current++;
    setOtwarte(false);
    setWskazywanie(false);
    setElement(null);
    setZrzut(null);
  };

  return (
    <div {...{ [ATRYBUT_POMIN]: '' }}>
      {!otwarte && !schowany ? (
        <div className="fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom,1rem))+3.75rem)] right-4 z-40 inline-flex items-center rounded-full border border-line-strong bg-card/90 text-xs font-medium text-muted-foreground shadow-[0_12px_30px_-18px_rgba(0,0,0,0.55)] backdrop-blur sm:bottom-[5.25rem] sm:right-6">
          <button
            type="button"
            data-zglos-uwage
            onClick={otworz}
            className="inline-flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-2 transition-colors hover:bg-raised hover:text-foreground"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
            Zgłoś uwagę
          </button>
          <button
            type="button"
            data-schowaj-uwage
            aria-label="Schowaj przycisk „Zgłoś uwagę”"
            title="Schowaj"
            onClick={() => ustawSchowany(true)}
            className="rounded-r-full border-l border-line py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-raised hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}
      {!otwarte && schowany ? (
        <button
          type="button"
          data-pokaz-uwage
          aria-label="Pokaż przycisk „Zgłoś uwagę”"
          title="Zgłoś uwagę"
          onClick={() => ustawSchowany(false)}
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-md border border-r-0 border-line-strong bg-card/90 px-1.5 py-3 text-muted-foreground shadow backdrop-blur transition-colors hover:bg-raised hover:text-foreground"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      <div className={wskazywanie ? 'hidden' : undefined}>
        <PanelModal
          open={otwarte}
          onClose={zamknij}
          title="Zgłoś uwagę"
          className="max-h-[92dvh] overflow-y-auto"
          description="Panel jest w fazie testów. Do zgłoszenia dołączymy adres tej strony (bez parametrów), wersję panelu, szerokość okna, przeglądarkę i godzinę. Możesz wskazać miejsce na stronie — zaznaczymy je na zrzucie ekranu."
        >
          <FormularzUwagi
            usluga={usluga ?? null}
            element={element}
            zrzut={zrzut}
            onWskaz={() => setWskazywanie(true)}
            onUsunElement={() => {
              setElement(null);
              zrob(null);
            }}
            onPonowZrzut={() => zrob(element?.ramka ?? null)}
            onZamknij={zamknij}
          />
        </PanelModal>
      </div>
      {otwarte && wskazywanie ? (
        <WskazywanieElementu
          onAnuluj={() => setWskazywanie(false)}
          onWybrano={(el) => {
            const opis = opisElementu(el, { szer: window.innerWidth, wys: window.innerHeight });
            setElement(opis);
            setWskazywanie(false);
            zrob(opis.ramka);
          }}
        />
      ) : null}
    </div>
  );
}

function FormularzUwagi({
  usluga,
  element,
  zrzut,
  onWskaz,
  onUsunElement,
  onPonowZrzut,
  onZamknij,
}: {
  usluga: { id: string; nazwa: string } | null;
  element: OpisElementu | null;
  zrzut: Zrzut | null;
  onWskaz: () => void;
  onUsunElement: () => void;
  onPonowZrzut: () => void;
  onZamknij: () => void;
}) {
  const pathname = usePathname();
  const idPola = useId();
  const idBledu = useId();
  const idZrzutu = useId();
  const formularz = useRef<HTMLFormElement>(null);
  const [tekst, setTekst] = useState('');
  const [rodzaj, setRodzaj] = useState<RodzajUwagi | null>(null);
  const [dolaczZrzut, setDolaczZrzut] = useState(true);
  const [blad, setBlad] = useState<string | null>(null);
  const [wysylanie, setWysylanie] = useState(false);
  const [utworzone, setUtworzone] = useState<string | null>(null);

  if (utworzone) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-sm text-foreground">
          Dziękujemy — zgłoszenie{' '}
          <Link href={`/dashboard/support/${utworzone}`} onClick={onZamknij} className="font-mono font-semibold underline underline-offset-2">
            {numerZgloszenia(utworzone)}
          </Link>{' '}
          utworzone. Odpowiemy w nim.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onZamknij} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-raised">
            Zamknij
          </button>
        </div>
      </div>
    );
  }

  const zrzutDoWyslania = dolaczZrzut && zrzut?.stan === 'gotowy' ? zrzut.plik : null;

  async function wyslij(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const walidacja = bladUwagi(tekst);
    if (walidacja) {
      setBlad(walidacja);
      return;
    }
    setBlad(null);
    setWysylanie(true);
    const kontekst = {
      sciezka: pathname ?? window.location.pathname,
      wersjaPanelu: WERSJA_PANELU,
      szerokoscOkna: window.innerWidth,
      userAgent: navigator.userAgent,
      teraz: new Date(),
      rodzaj,
      usluga: usluga?.nazwa ?? null,
      element,
      zrzut: Boolean(zrzutDoWyslania),
    };
    const dane = new FormData();
    dane.append('subject', tematUwagi(tekst));
    dane.append('message', trescUwagi(tekst, kontekst));
    dane.append('topic', 'BETA');
    if (usluga) dane.append('subscriptionId', usluga.id);
    if (zrzutDoWyslania) dane.append('files', zrzutDoWyslania);
    const wlasne = formularz.current?.querySelector<HTMLInputElement>('input[type="file"][name="files"]')?.files;
    for (const f of Array.from(wlasne ?? [])) dane.append('files', f);
    try {
      const wynik = await createTicketWithFiles(dane);
      if (wynik.success) setUtworzone((wynik.data as { id: string }).id);
      else setBlad(wynik.error ?? 'Nie udało się wysłać uwagi.');
    } catch (err) {
      if (!odswiezPoWdrozeniu(err)) setBlad('Nie udało się wysłać uwagi. Spróbuj ponownie za chwilę.');
    } finally {
      setWysylanie(false);
    }
  }

  return (
    <form ref={formularz} onSubmit={wyslij} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={idPola} className="text-sm font-medium text-foreground">
          Co się stało / co poprawić
        </label>
        <textarea
          id={idPola}
          value={tekst}
          onChange={(e) => {
            setTekst(e.target.value);
            if (blad) setBlad(null);
          }}
          required
          minLength={10}
          maxLength={MAX_ZNAKOW_UWAGI}
          rows={4}
          aria-invalid={blad ? true : undefined}
          aria-describedby={blad ? idBledu : undefined}
          className="w-full resize-y rounded-md border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-verris-mint"
        />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-foreground">
          Rodzaj <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {RODZAJE_UWAGI.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={rodzaj === r.value}
              onClick={() => setRodzaj(rodzaj === r.value ? null : r.value)}
              className={cx(
                'rounded-full border px-3 py-1 text-xs',
                rodzaj === r.value ? 'border-verris-mint bg-verris-mint/10 text-foreground' : 'border-line text-muted-foreground hover:bg-raised',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <p className="m-0 text-sm font-medium text-foreground">
          Miejsce na stronie <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
        </p>
        {element ? (
          <div data-wskazany-element className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-background px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 break-words">
              {element.opis}
              {element.sekcja ? <span className="text-muted-foreground"> · {element.sekcja}</span> : null}
            </span>
            <button type="button" onClick={onWskaz} className="text-xs underline underline-offset-2 hover:text-foreground">
              Wskaż ponownie
            </button>
            <button type="button" onClick={onUsunElement} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-crit">
              Usuń
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onWskaz}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-raised"
          >
            <Crosshair className="h-4 w-4" aria-hidden />
            Wskaż miejsce na stronie
          </button>
        )}
      </div>
      <div className="space-y-1.5" data-zrzut-ekranu>
        <div className="flex items-center gap-2">
          <Checkbox id={idZrzutu} checked={dolaczZrzut} onChange={(e) => setDolaczZrzut(e.target.checked)} />
          <label htmlFor={idZrzutu} className="text-sm text-foreground">
            Dołącz zrzut ekranu
          </label>
        </div>
        {dolaczZrzut ? (
          zrzut?.stan === 'gotowy' ? (
            <div className="flex items-start gap-3">
              <a href={zrzut.url} target="_blank" rel="noreferrer" className="block shrink-0" title="Otwórz zrzut w nowej karcie">
                {/* eslint-disable-next-line @next/next/no-img-element -- podgląd z blob: (lokalny plik), nie obraz z serwera */}
                <img src={zrzut.url} alt="Podgląd zrzutu ekranu" className="h-20 w-auto max-w-[9rem] rounded border border-line object-cover object-top" />
              </a>
              <p className="m-0 text-xs text-muted-foreground">
                Zrzut widocznej części strony{element ? ' z zaznaczonym miejscem' : ''}. Sprawdź podgląd, zanim wyślesz — jeśli widać na nim coś
                prywatnego, odznacz zrzut.
              </p>
            </div>
          ) : zrzut?.stan === 'trwa' ? (
            <p className="m-0 text-xs text-muted-foreground" role="status">
              Przygotowuję zrzut ekranu…
            </p>
          ) : zrzut?.stan === 'brak' ? (
            <p className="m-0 text-xs text-muted-foreground">
              Nie udało się zrobić zrzutu w tej przeglądarce.{' '}
              <button type="button" onClick={onPonowZrzut} className="underline underline-offset-2 hover:text-foreground">
                Spróbuj ponownie
              </button>{' '}
              albo dołącz własny plik niżej.
            </p>
          ) : null
        ) : null}
      </div>
      <PoleZalacznikow name="files" maxPlikow={4} />
      {blad ? (
        <p id={idBledu} role="alert" className="m-0 text-[13px] text-crit">
          {blad}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onZamknij} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-raised">
          Anuluj
        </button>
        <button
          type="submit"
          disabled={wysylanie || (dolaczZrzut && zrzut?.stan === 'trwa')}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {wysylanie ? 'Wysyłanie…' : dolaczZrzut && zrzut?.stan === 'trwa' ? 'Czekam na zrzut…' : 'Wyślij'}
        </button>
      </div>
    </form>
  );
}

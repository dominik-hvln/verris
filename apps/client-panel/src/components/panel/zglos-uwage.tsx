'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus } from 'lucide-react';
import { odswiezPoWdrozeniu } from '@verris/ui';
import { createTicket } from '@/app/dashboard/support/actions';
import {
  MAX_ZNAKOW_UWAGI,
  RODZAJE_UWAGI,
  bladUwagi,
  czyZglosUwageWlaczone,
  numerZgloszenia,
  tematUwagi,
  trescUwagi,
  type RodzajUwagi,
} from '@/lib/uwaga-z-bety';
import { PanelModal } from './panel-modal';
import { cx } from './cx';

/** Wstrzykiwana przy buildzie (next.config.ts) — w testach i `next dev` bez builda może jej nie być. */
const WERSJA_PANELU = process.env.NEXT_PUBLIC_WERSJA_PANELU ?? '';

/**
 * Beta — pływający przycisk „Zgłoś uwagę”. Widoczny tylko przy fladze `beta.zglos-uwage`
 * (Admin → Komunikaty i flagi → Flagi funkcji; brak flagi = ukryty) i gdy konto może zakładać zgłoszenia
 * (subkonto bez „Zgłoszenia: zarządzanie” nie widzi przycisku — API i tak by odmówiło).
 * Stoi nad przyciskiem asystenta (prawy dolny róg) i pod jego oknem (z-40 < z-50), więc go nie zasłania.
 * Uwaga = zwykłe zgłoszenie (POST /tickets, temat BETA) — w podglądzie konta przez obsługę API zapisuje
 * je ze źródłem IMPERSONACJA, jak każde zgłoszenie założone w tej sesji.
 */
export function ZglosUwage({
  flagi,
  mozeZglaszac,
  usluga,
}: {
  flagi: Record<string, boolean>;
  mozeZglaszac: boolean;
  /** Usługa, gdy klient jest na stronie usługi (id z /services = id subskrypcji). */
  usluga?: { id: string; nazwa: string } | null;
}) {
  const [otwarte, setOtwarte] = useState(false);
  if (!czyZglosUwageWlaczone(flagi) || !mozeZglaszac) return null;
  return (
    <>
      <button
        type="button"
        data-zglos-uwage
        onClick={() => setOtwarte(true)}
        className="fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom,1rem))+3.75rem)] right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[0_12px_30px_-18px_rgba(0,0,0,0.55)] backdrop-blur transition-colors hover:bg-raised hover:text-foreground sm:bottom-[5.25rem] sm:right-6"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
        Zgłoś uwagę
      </button>
      <PanelModal
        open={otwarte}
        onClose={() => setOtwarte(false)}
        title="Zgłoś uwagę"
        description="Panel jest w fazie testów. Do zgłoszenia dołączymy adres tej strony (bez parametrów), wersję panelu, szerokość okna, przeglądarkę i godzinę."
      >
        <FormularzUwagi usluga={usluga ?? null} onZamknij={() => setOtwarte(false)} />
      </PanelModal>
    </>
  );
}

function FormularzUwagi({ usluga, onZamknij }: { usluga: { id: string; nazwa: string } | null; onZamknij: () => void }) {
  const pathname = usePathname();
  const idPola = useId();
  const idBledu = useId();
  const [tekst, setTekst] = useState('');
  const [rodzaj, setRodzaj] = useState<RodzajUwagi | null>(null);
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
    };
    try {
      const wynik = await createTicket(tematUwagi(tekst), trescUwagi(tekst, kontekst), {
        topic: 'BETA',
        ...(usluga ? { subscriptionId: usluga.id } : {}),
      });
      if (wynik.success) setUtworzone(wynik.data.id);
      else setBlad(wynik.error);
    } catch (err) {
      if (!odswiezPoWdrozeniu(err)) setBlad('Nie udało się wysłać uwagi. Spróbuj ponownie za chwilę.');
    } finally {
      setWysylanie(false);
    }
  }

  return (
    <form onSubmit={wyslij} noValidate className="space-y-4">
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
          rows={5}
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
          disabled={wysylanie}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {wysylanie ? 'Wysyłanie…' : 'Wyślij'}
        </button>
      </div>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { events } from '@/lib/analytics';
import { captchaTokenFromForm } from '@/lib/captcha-token';
import { submitBeta } from '@/lib/submit-beta';
import { ZAKRESY, wyslijZgloszenie, zapamietajUtm, type Utm, type ZakresTestu } from '@/lib/beta';
import { readConsent, wolnoZapamietacUtm } from '@/lib/cookie-consent';
import { Captcha } from './Captcha';

type Bledy = Partial<Record<'imie' | 'email' | 'zakres' | 'strona' | 'zgoda', string>>;

/**
 * Formularz zgłoszenia do otwartych testów (verris.pl/beta) → server action submitBeta → POST /public/beta/zgloszenia.
 * Logika (walidacja, treść żądania, komunikaty) w lib/beta.ts — tam są testy. API wysyła mail z linkiem potwierdzającym;
 * zaproszenie z kodem idzie dopiero po wyborze z listy zgłoszeń w panelu admina.
 */
export function BetaForm() {
  const [zakres, setZakres] = useState<ZakresTestu[]>([]);
  const [bledy, setBledy] = useState<Bledy>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [blad, setBlad] = useState<{ tekst: string; kontakt: boolean } | null>(null);
  const utm = useRef<Utm | undefined>(undefined);
  const okRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // A2-05: źródło kampanii zapisujemy w przeglądarce tylko po zgodzie analitycznej albo marketingowej; bez niej UTM
    // bierzemy wyłącznie z adresu bieżącej strony (nic nie zostaje na urządzeniu).
    let magazyn: Storage | null = null;
    try {
      magazyn = wolnoZapamietacUtm(readConsent()) ? window.sessionStorage : null;
    } catch {
      magazyn = null;
    }
    utm.current = zapamietajUtm(window.location.search, magazyn);
  }, []);

  useEffect(() => {
    if (sent) okRef.current?.focus();
  }, [sent]);

  const przelacz = (id: ZakresTestu) =>
    setZakres((z) => (z.includes(id) ? z.filter((x) => x !== id) : [...z, id]));

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => fd.get(k)?.toString() ?? '';
    setBusy(true);
    setBlad(null);
    const wynik = await wyslijZgloszenie(
      {
        imie: s('beta-imie'),
        email: s('beta-email'),
        zakres,
        strona: s('beta-strona'),
        obecnyHosting: s('beta-hosting'),
        uwagi: s('beta-uwagi'),
        zgoda: fd.get('beta-zgoda') === 'on',
        pulapka: s('pulapka'),
      },
      { utm: utm.current, page: window.location.href, captchaToken: captchaTokenFromForm(fd) },
      { submit: submitBeta, onLead: () => events.generateLead('beta_signup') },
    );
    setBusy(false);
    if (wynik.stan === 'bledy') {
      setBledy(wynik.bledy);
      // Fokus na pierwsze błędne pole (kolejność jak w formularzu); dla zakresu — pierwszy przełącznik.
      const pierwsze = (['imie', 'email', 'zakres', 'strona', 'zgoda'] as const).find((k) => wynik.bledy[k]);
      const cel = pierwsze === 'zakres' ? document.querySelector<HTMLElement>('.bt-tagi button') : pierwsze === 'zgoda' ? document.querySelector<HTMLElement>('.bt-zgoda input') : pierwsze ? document.getElementById(`bt-${pierwsze}`) : null;
      cel?.focus();
      return;
    }
    setBledy({});
    if (wynik.stan === 'blad') {
      setBlad({ tekst: wynik.tekst, kontakt: wynik.kontakt });
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="card bt-ok" role="status" aria-live="polite">
        <h3 ref={okRef} tabIndex={-1}>
          Dziękujemy, zgłoszenie przyjęte.
        </h3>
        <p>
          Sprawdź skrzynkę i potwierdź adres linkiem z maila – bez tego nie wyślemy zaproszenia. Zajrzyj też do Oferty
          lub Spamu.
        </p>
      </div>
    );
  }

  const opis = (pole: keyof Bledy) => (bledy[pole] ? `bt-${pole}-blad` : undefined);

  return (
    <form className="card bt-form" onSubmit={onSubmit} noValidate aria-describedby="bt-form-info">
      <div className="bt-pola">
        <div className="field">
          <label htmlFor="bt-imie">Imię</label>
          <input id="bt-imie" name="beta-imie" type="text" required maxLength={60} autoComplete="given-name" aria-invalid={bledy.imie ? true : undefined} aria-describedby={opis('imie')} />
          {bledy.imie && <p className="bt-blad" id="bt-imie-blad">{bledy.imie}</p>}
        </div>
        <div className="field">
          <label htmlFor="bt-email">E-mail</label>
          <input id="bt-email" name="beta-email" type="email" required maxLength={320} autoComplete="email" aria-invalid={bledy.email ? true : undefined} aria-describedby={opis('email')} />
          {bledy.email && <p className="bt-blad" id="bt-email-blad">{bledy.email}</p>}
        </div>
      </div>

      <fieldset className="bt-zakres" aria-describedby={opis('zakres')}>
        <legend>Co chcesz przetestować?</legend>
        <div className="bt-tagi">
          {ZAKRESY.map((z) => (
            <button key={z.id} type="button" aria-pressed={zakres.includes(z.id)} onClick={() => przelacz(z.id)}>
              {z.label}
            </button>
          ))}
        </div>
        {bledy.zakres && <p className="bt-blad" id="bt-zakres-blad">{bledy.zakres}</p>}
      </fieldset>

      <div className="bt-pola">
        <div className="field">
          <label htmlFor="bt-strona">Adres strony (jeśli masz)</label>
          <input id="bt-strona" name="beta-strona" type="text" inputMode="url" maxLength={2048} placeholder="np. twojafirma.pl" autoComplete="url" aria-invalid={bledy.strona ? true : undefined} aria-describedby={opis('strona')} />
          {bledy.strona && <p className="bt-blad" id="bt-strona-blad">{bledy.strona}</p>}
        </div>
        <div className="field">
          <label htmlFor="bt-hosting">U kogo masz teraz hosting? (opcjonalnie)</label>
          <input id="bt-hosting" name="beta-hosting" type="text" maxLength={100} autoComplete="off" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="bt-uwagi">Coś jeszcze? (opcjonalnie)</label>
        <textarea id="bt-uwagi" name="beta-uwagi" maxLength={2000} rows={3} />
      </div>

      {/* Honeypot: ukryte przed ludźmi i czytnikami ekranu; API po cichu pomija zgłoszenie z wypełnionym polem.
          P1-07: nazwa i etykieta bez znaczenia dla autouzupełniania (wcześniej „firma” — przeglądarka ją wypełniała). */}
      <div className="bt-hp" aria-hidden="true">
        <label htmlFor="bt-pulapka">Zostaw to pole puste</label>
        <input id="bt-pulapka" name="pulapka" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="bt-zgoda">
        <input type="checkbox" name="beta-zgoda" required aria-invalid={bledy.zgoda ? true : undefined} aria-describedby={opis('zgoda')} />
        <span>
          Chcę dostać zaproszenie do testów i wiadomości z nimi związane. Administratorem danych jest HVLN Dominik
          Kowalski; szczegóły w <a href="https://panel.verris.pl/legal/privacy">polityce prywatności</a>.
        </span>
      </label>
      {bledy.zgoda && <p className="bt-blad" id="bt-zgoda-blad">{bledy.zgoda}</p>}

      <Captcha action="lead" />

      <div aria-live="assertive">
        {blad && (
          <p className="form-error" role="alert">
            {blad.tekst}
            {blad.kontakt && (
              <>
                {' '}
                <Link href="/kontakt">Formularz kontaktowy</Link>
              </>
            )}
          </p>
        )}
      </div>

      <button className="btn btn-primary bt-wyslij" type="submit" disabled={busy} data-event="cta_click" data-cta="beta-zgloszenie">
        {busy ? 'Wysyłam…' : 'Zgłaszam się'}
      </button>
      <p className="form-note" id="bt-form-info">
        Po wysłaniu dostaniesz mail z linkiem do potwierdzenia adresu. Zaproszenie z kodem przychodzi osobno, gdy
        wybierzemy grupę.
      </p>
    </form>
  );
}

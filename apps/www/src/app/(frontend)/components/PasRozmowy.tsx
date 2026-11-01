'use client';

import { useState } from 'react';
import { events } from '@/lib/analytics';
import { captchaTokenFromForm } from '@/lib/captcha-token';
import { submitCallback, type PoraOddzwonienia } from '@/lib/submit-callback';
import { Captcha } from './Captcha';

/** Klauzula przy formularzu — trafia do API jako dowód informacji (consentText). */
export const KLAUZULA_ODDZWONIENIA =
  'Numer wykorzystamy tylko do tej rozmowy. Dane przetwarzamy zgodnie z polityką prywatności verris.pl.';

/** Godziny oddzwaniania — decyzja Dominika 1.11.2026. */
export const GODZINY_ODDZWANIANIA = 'Oddzwonimy w dni robocze 9–17, zwykle tego samego dnia.';

const PORY: { id: PoraOddzwonienia; label: string }[] = [
  { id: 'rano', label: 'rano' },
  { id: 'poludnie', label: 'w południe' },
  { id: 'popoludnie', label: 'po 14:00' },
];

/**
 * Pas „Wolisz porozmawiać?” (makieta 1.11): prośba o telefon zwrotny → POST /public/leads/callback.
 * Wstaw przed stopką strony usługi. `id` pozwala linkować do pasa (np. „Poproś o telefon” w sekcji przeniesienia).
 */
export function PasRozmowy({ id = 'porozmawiajmy', zrodlo = 'callback_form' }: { id?: string; zrodlo?: string }) {
  const [pora, setPora] = useState<PoraOddzwonienia>('rano');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const name = fd.get('cb-imie')?.toString().trim() ?? '';
    const phone = fd.get('cb-tel')?.toString().trim() ?? '';
    if (!name || !phone) return;
    setBusy(true);
    setError(null);
    const res = await submitCallback({
      name,
      phone,
      preferredTime: pora,
      consentText: KLAUZULA_ODDZWONIENIA,
      page: typeof window !== 'undefined' ? window.location.href : undefined,
      captchaToken: captchaTokenFromForm(fd),
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        res.status === 400
          ? 'Sprawdź numer telefonu: 9–15 cyfr, może zaczynać się od +.'
          : res.status === 429
            ? 'Za dużo prób w krótkim czasie. Spróbuj za godzinę albo napisz na kontakt@verris.pl.'
            : 'Nie udało się wysłać. Spróbuj ponownie albo napisz na kontakt@verris.pl.',
      );
      return;
    }
    events.generateLead(zrodlo);
    setSent(true);
  };

  return (
    <section className="sec pasrozm-sec" id={id} aria-labelledby={`${id}-h`}>
      <div className="wrap">
        <div className="card pasrozm">
          <div className="pasrozm-kto">
            <span className="pasrozm-av" aria-hidden="true">
              D
            </span>
            <div>
              <h2 id={`${id}-h`}>Wolisz porozmawiać?</h2>
              <p>
                Zostaw numer, oddzwoni Dominik, który buduje Verris. Pomożemy dobrać ustawienia i zaplanować
                przeniesienie strony.
              </p>
              <p className="pasrozm-godz">{GODZINY_ODDZWANIANIA}</p>
            </div>
          </div>
          {sent ? (
            <div className="form-ok pasrozm-ok" role="status">
              Dziękujemy! Oddzwonimy w wybranej porze dnia. {GODZINY_ODDZWANIANIA}
            </div>
          ) : (
            <form className="pasrozm-form" onSubmit={onSubmit}>
              <div className="pasrozm-pola">
                <div className="field">
                  <label htmlFor={`${id}-imie`}>Imię</label>
                  <input id={`${id}-imie`} name="cb-imie" type="text" required maxLength={100} autoComplete="given-name" />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-tel`}>Telefon</label>
                  <input
                    id={`${id}-tel`}
                    name="cb-tel"
                    type="tel"
                    required
                    maxLength={32}
                    inputMode="tel"
                    autoComplete="tel"
                    pattern="\+?[0-9 \-]{9,20}"
                  />
                </div>
              </div>
              <fieldset className="pasrozm-pora">
                <legend>Kiedy zadzwonić?</legend>
                <div className="pasrozm-radio">
                  {PORY.map((p) => (
                    <label key={p.id}>
                      <input type="radio" name="cb-pora" value={p.id} checked={pora === p.id} onChange={() => setPora(p.id)} />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Captcha action="lead" />
              <button className="btn btn-primary" type="submit" disabled={busy} data-event="cta_click" data-cta="callback-submit">
                {busy ? 'Wysyłam…' : 'Poproś o telefon'}
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <p className="form-note">
                Numer wykorzystamy tylko do tej rozmowy. Szczegóły w{' '}
                <a href="https://panel.verris.pl/legal/privacy">polityce prywatności</a>.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

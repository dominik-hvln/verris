'use client';

import { useState } from 'react';
import { events } from '@/lib/analytics';
import { submitLead } from '@/lib/submit-lead';
import { captchaTokenFromForm } from '@/lib/captcha-token';
import { Captcha } from './Captcha';

// Ta sama treść, którą widzi użytkownik przy checkboxie — API zapisuje ją jako dowód zgody (A2-14).
export const CONSENT_TEXT =
  'Chcę też dostać kilka wiadomości o hostingu Verris. Zgodę mogę wycofać w każdej chwili linkiem rezygnacji w mailu.';

/**
 * Lead „Zaplanuj migrację” (A2-01, paczka 109): plan przychodzi mailem zawsze — to odpowiedź na prośbę
 * (wiadomość transakcyjna). Zgoda na dalsze wiadomości jest OSOBNYM, niezaznaczonym i nieobowiązkowym
 * checkboxem; z nią API wysyła w tym samym mailu link potwierdzenia (double opt-in) i link wypisu.
 * Rejestr zgody (data, treść, IP) zapisuje API.
 */
export function MigrationLeadForm() {
  const [sent, setSent] = useState<false | 'plan' | 'zgoda'>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email')?.toString().trim() ?? '';
    if (!email) return;
    setBusy(true);
    setError(null);
    const res = await submitLead({
      kind: 'MIGRATION',
      email,
      source: 'migration_plan',
      marketingConsent: consent,
      consentText: consent ? CONSENT_TEXT : undefined,
      page: typeof window !== 'undefined' ? window.location.href : undefined,
      captchaToken: captchaTokenFromForm(fd),
    });
    setBusy(false);
    if (!res.ok) {
      setError('Coś poszło nie tak — spróbuj ponownie albo napisz na kontakt@verris.pl.');
      return;
    }
    events.generateLead('migration_plan');
    setSent(consent ? 'zgoda' : 'plan');
  };

  if (sent) {
    return (
      <div className="leadband">
        <div className="form-ok" role="status">
          {sent === 'zgoda'
            ? 'Plan jest już w Twojej skrzynce. Kliknij w nim „Potwierdzam”, jeśli chcesz dostawać kolejne wiadomości — bez tego nie wyślemy nic więcej.'
            : 'Plan jest już w Twojej skrzynce. Nie wyślemy Ci nic więcej.'}{' '}
          Jeśli mail nie dotarł w ciągu kilku minut, zajrzyj do spamu.
        </div>
      </div>
    );
  }

  return (
    <div className="leadband">
      <div className="leadband-copy">
        <h2>Zaplanuj migrację</h2>
        <p>
          Zostaw adres, a wyślemy Ci plan przeniesienia strony w 3 krokach — bez przestoju i bez
          zgadywania. Plus konkrety: ile realnie kosztuje hosting i co dzieje się z pocztą.
        </p>
      </div>

      <form id="migration-lead" className="leadband-form" onSubmit={onSubmit}>
        <div className="lead-row">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Twój adres e-mail"
            aria-label="Adres e-mail"
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            data-event="cta_click"
            data-cta="lead-migracja"
          >
            {busy ? 'Wysyłam…' : 'Wyślij mi plan'}
          </button>
        </div>

        {error && (
          <p className="lead-error" role="alert" style={{ color: '#ff9b9b' }}>
            {error}
          </p>
        )}

        <label className="lead-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            {CONSENT_TEXT} (nieobowiązkowe)
          </span>
        </label>

        <Captcha action="lead" />

        <p className="lead-note">
          Plan wyślemy na podany adres. Administratorem danych jest HVLN Dominik Kowalski; adres
          przechowujemy zgodnie z{' '}
          <a href="https://panel.verris.pl/legal/privacy">polityką prywatności</a>.
        </p>
      </form>
    </div>
  );
}

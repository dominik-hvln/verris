'use client';

import { useState } from 'react';
import { events } from '@/lib/analytics';
import { submitLead } from '@/lib/submit-lead';

const CONSENT_TEXT =
  'Chcę otrzymać plan migracji i kilka wiadomości o hostingu Verris. Zgodę mogę wycofać w każdej chwili linkiem rezygnacji w mailu.';

/**
 * Lead „Zaplanuj migrację" — wejście do sekwencji nurture.
 *
 * Compliance (PKE/RODO): zgoda marketingowa jest OSOBNYM, niezaznaczonym checkboxem,
 * a potwierdzenie adresu odbywa się przez double opt-in (mail E0). Bez zgody nie wysyłamy nic.
 * Rejestr zgody (data, treść, IP) zapisuje API na podstawie tego zgłoszenia.
 */
export function MigrationLeadForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consent || busy) return;
    const email = new FormData(e.currentTarget).get('email')?.toString().trim() ?? '';
    if (!email) return;
    setBusy(true);
    setError(null);
    const res = await submitLead({
      kind: 'MIGRATION',
      email,
      source: 'migration_plan',
      marketingConsent: true,
      consentText: CONSENT_TEXT,
      page: typeof window !== 'undefined' ? window.location.href : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError('Coś poszło nie tak — spróbuj ponownie albo napisz na kontakt@verris.pl.');
      return;
    }
    events.generateLead('migration_plan');
    setSent(true);
  };

  if (sent) {
    return (
      <div className="leadband rv">
        <div className="form-ok" role="status">
          Sprawdź skrzynkę — wysłaliśmy wiadomość z prośbą o potwierdzenie adresu. Bez tego kroku nie
          wyślemy Ci nic więcej. Jeśli mail nie dotarł w ciągu kilku minut, zajrzyj do spamu.
        </div>
      </div>
    );
  }

  return (
    <div className="leadband rv">
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
            disabled={!consent || busy}
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
            required
          />
          <span>
            Chcę otrzymać plan migracji i kilka wiadomości o hostingu Verris. Zgodę mogę wycofać
            w każdej chwili, klikając link rezygnacji w mailu. Szczegóły w{' '}
            <a href="https://panel.verris.pl/legal/privacy">polityce prywatności</a>.
          </span>
        </label>

        <p className="lead-note">
          Potwierdzimy adres jednym klikiem (double opt-in). Nie wysyłamy spamu i nie przekazujemy
          adresu nikomu.
        </p>
      </form>
    </div>
  );
}

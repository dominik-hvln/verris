'use client';

import { useState } from 'react';
import { events } from '@/lib/analytics';

/**
 * Lead „Zaplanuj migrację" — wejście do sekwencji nurture.
 *
 * Compliance (PKE/RODO): zgoda marketingowa jest OSOBNYM, niezaznaczonym checkboxem,
 * a potwierdzenie adresu odbywa się przez double opt-in (mail E0). Bez zgody nie wysyłamy nic.
 * TODO (Dominik): podpiąć wysyłkę + rejestr zgód (data, treść zgody, IP) przez API/SES.
 */
export function MigrationLeadForm() {
  const [sent, setSent] = useState(false);
  const [consent, setConsent] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consent) return;
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
            disabled={!consent}
            data-event="cta_click"
            data-cta="lead-migracja"
          >
            Wyślij mi plan
          </button>
        </div>

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
            <a href="https://panel.verris.pl/legal">polityce prywatności</a>.
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

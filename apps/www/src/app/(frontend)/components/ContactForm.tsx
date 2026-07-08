'use client';

import { useState } from 'react';
import { events } from '@/lib/analytics';

export function ContactForm() {
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Lead do dataLayer (GTM → GA4/Ads/Meta), pomiar wyłącznie po zgodzie.
    events.generateLead('contact_form');
    // TODO (Dominik): podpiąć wysyłkę przez API (SES). Na razie potwierdzenie po stronie klienta.
    setSent(true);
  };

  if (sent) {
    return (
      <div className="form-ok" role="status">
        Dziękujemy! Wiadomość została przyjęta — odezwiemy się na podany adres e-mail. Jeśli sprawa
        jest pilna, napisz bezpośrednio na{' '}
        <a href="mailto:kontakt@verris.pl">kontakt@verris.pl</a>.
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="name">Imię i nazwisko</label>
        <input id="name" name="name" type="text" required autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="message">Wiadomość</label>
        <textarea id="message" name="message" required />
      </div>
      <button className="btn btn-primary" type="submit" data-event="cta_click" data-cta="contact-submit">
        Wyślij wiadomość
      </button>
      <p className="form-note">
        Wysyłając formularz, zgadzasz się na kontakt w sprawie zapytania. Dane przetwarzamy zgodnie z{' '}
        <a href="https://panel.verris.pl/legal">polityką prywatności</a>. Nie wykorzystujemy ich do
        marketingu bez osobnej zgody.
      </p>
    </form>
  );
}

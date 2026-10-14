'use client';

import { useState } from 'react';
import { events } from '@/lib/analytics';
import { submitLead } from '@/lib/submit-lead';
import { captchaTokenFromForm } from '@/lib/captcha-token';
import { TEMATY_KONTAKTU, trescKontaktu } from '@/lib/kontakt';
import { Captcha } from './Captcha';

export function ContactForm() {
  const [temat, setTemat] = useState(0);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email')?.toString().trim() ?? '';
    const name = fd.get('name')?.toString().trim() ?? '';
    const tekst = fd.get('message')?.toString().trim() ?? '';
    if (!email || !tekst) return;
    const message = trescKontaktu(TEMATY_KONTAKTU[temat].nazwa, fd.get('website')?.toString() ?? '', tekst);
    setBusy(true);
    setError(null);
    const res = await submitLead({
      kind: 'CONTACT',
      email,
      name,
      message,
      source: 'contact_form',
      page: typeof window !== 'undefined' ? window.location.href : undefined,
      captchaToken: captchaTokenFromForm(fd),
    });
    setBusy(false);
    if (!res.ok) {
      setError('Nie udało się wysłać — spróbuj ponownie albo napisz na kontakt@verris.pl.');
      return;
    }
    // Lead do dataLayer (GTM → GA4/Ads/Meta), pomiar wyłącznie po zgodzie.
    events.generateLead('contact_form');
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
    <form id="contact" className="form" onSubmit={onSubmit}>
      <div className="d-tematy" role="group" aria-label="Temat wiadomości">
        {TEMATY_KONTAKTU.map((t, i) => (
          <button key={t.nazwa} type="button" aria-pressed={i === temat} onClick={() => setTemat(i)}>
            {t.nazwa}
          </button>
        ))}
      </div>
      <p className="d-podpowiedz" aria-live="polite">
        {TEMATY_KONTAKTU[temat].podpowiedz}
      </p>
      <div className="field">
        <label htmlFor="name">Imię i nazwisko</label>
        <input id="name" name="name" type="text" required autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="website">Adres strony (opcjonalnie)</label>
        <input id="website" name="website" type="text" inputMode="url" autoComplete="url" placeholder="twojastrona.pl" />
      </div>
      <div className="field">
        <label htmlFor="message">Wiadomość</label>
        <textarea id="message" name="message" required />
      </div>
      <Captcha action="lead" />
      <button className="btn btn-primary" type="submit" disabled={busy} data-event="cta_click" data-cta="contact-submit">
        {busy ? 'Wysyłam…' : 'Wyślij wiadomość'}
      </button>
      {error && (
        <p className="form-error" role="alert" style={{ color: '#ff9b9b' }}>
          {error}
        </p>
      )}
      <p className="form-note">
        Wysyłając formularz, zgadzasz się na kontakt w sprawie zapytania. Dane przetwarzamy zgodnie z{' '}
        <a href="https://panel.verris.pl/legal/privacy">polityką prywatności</a>. Nie wykorzystujemy ich do
        marketingu bez osobnej zgody.
      </p>
    </form>
  );
}

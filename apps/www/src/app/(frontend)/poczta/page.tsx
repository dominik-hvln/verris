import type { Metadata } from 'next';
import { SubHero, CTABand } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Poczta e-mail w hostingu — skrzynki na własnej domenie | Verris',
  description:
    'Skrzynki e-mail na własnej domenie w ramach hostingu Verris. Webmail Roundcube, konfiguracja w DirectAdmin, bez limitu liczby skrzynek w ramach zasobów konta. Migracja poczty w cenie.',
  alternates: { canonical: '/poczta' },
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Poczta e-mail"
        title="Firmowa poczta na własnej domenie"
        lead="Profesjonalny adres @twojafirma.pl zamiast darmowej skrzynki. Konta pocztowe w ramach hostingu, webmail Roundcube i konfiguracja w kilku klikach."
        crumbs={[{ label: 'Hosting', href: '/hosting' }, { label: 'Poczta' }]}
        primary={{ label: 'Załóż konto', href: PANEL, conv: 'checkout_intent', plan: 'poczta' }}
        secondary={{ label: 'Zobacz hosting', href: '/hosting' }}
      />
      <section>
        <div className="wrap">
          <div className="prose rv">
            <h2>Poczta w ramach hostingu</h2>
            <ul>
              <li>Skrzynki na własnej domenie — bez limitu liczby w ramach zasobów konta.</li>
              <li>Webmail Roundcube pod webmail.verris.pl oraz obsługa IMAP/SMTP w kliencie.</li>
              <li>Konfiguracja i zarządzanie kontami z panelu DirectAdmin.</li>
              <li>Migracja poczty razem ze stroną — w cenie, bez przestoju.</li>
            </ul>
            <p>
              Chcesz wysyłać kampanie do własnej listy odbiorców? To osobna usługa —{' '}
              <a href="/email-marketing">e-mail marketing</a>.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Przenieś stronę i pocztę razem"
        text="Przeprowadzkę skrzynek bierzemy na siebie — bez utraty wiadomości."
        secondary={{ label: 'Jak działa migracja', href: '/przenies-strone' }}
      />
      <RevealInit />
    </main>
  );
}

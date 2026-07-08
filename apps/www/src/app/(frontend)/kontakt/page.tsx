import type { Metadata } from 'next';
import { Mail, LifeBuoy, Building2 } from 'lucide-react';
import { SubHero } from '../components/ui';
import { ContactForm } from '../components/ContactForm';
import { RevealInit } from '../components/RevealInit';

export const metadata: Metadata = {
  title: 'Kontakt — napisz do Verris',
  description:
    'Skontaktuj się z Verris. Napisz przez formularz lub na kontakt@verris.pl. Operator: HVLN Dominik Kowalski, Zielona Góra. Status usług: status.verris.pl.',
  alternates: { canonical: '/kontakt' },
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Kontakt"
        title="Porozmawiajmy"
        lead="Masz pytanie o hosting, migrację albo VPS? Napisz — odpowiada polski zespół. Zwykle wracamy z odpowiedzią tego samego dnia roboczego."
        crumbs={[{ label: 'Kontakt' }]}
      />
      <section>
        <div className="wrap">
          <div className="contact-grid">
            <div className="rv">
              <ContactForm />
            </div>
            <div className="contact-side rv">
              <div className="icard">
                <div className="ico"><Mail /></div>
                <h3>E-mail</h3>
                <p><a href="mailto:kontakt@verris.pl">kontakt@verris.pl</a></p>
              </div>
              <div className="icard">
                <div className="ico"><LifeBuoy /></div>
                <h3>Pomoc i status</h3>
                <p>
                  Najczęstsze pytania w <a href="/pomoc">Pomocy</a>. Dostępność usług na żywo:{' '}
                  <a href="https://status.verris.pl">status.verris.pl</a>.
                </p>
              </div>
              <div className="icard">
                <div className="ico"><Building2 /></div>
                <h3>Operator</h3>
                <p>HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <RevealInit />
    </main>
  );
}

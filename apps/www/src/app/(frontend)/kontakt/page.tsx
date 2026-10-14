import type { Metadata } from 'next';
import { Mail, LifeBuoy, Activity, Building2 } from 'lucide-react';
import { JsonLd, SubHero } from '../components/ui';
import { ContactForm } from '../components/ContactForm';
import { PANEL } from '@/lib/site';
import { organization, webPageSchema } from '@/lib/schema';

const OPIS =
  'Napisz do Verris przez formularz lub na kontakt@verris.pl. Pomoc po polsku, odpowiedź zwykle w ciągu dnia roboczego.';

export const metadata: Metadata = {
  title: 'Kontakt — Verris, polski hosting',
  description: OPIS,
  alternates: { canonical: '/kontakt' },
};

export default function Page() {
  return (
    <main>
      <JsonLd
        data={webPageSchema({
          type: 'ContactPage',
          name: 'Kontakt — Verris',
          description: OPIS,
          path: '/kontakt',
          extra: { mainEntity: organization },
        })}
      />

      <SubHero
        eyebrow="Kontakt"
        title="Porozmawiajmy. Odpisze człowiek, nie bot"
        lead="Pytasz o hosting, przeprowadzkę albo domenę? Napisz, a dostaniesz konkretną odpowiedź — zwykle w ciągu dnia roboczego."
        crumbs={[{ label: 'Kontakt' }]}
      />

      <section className="sec">
        <div className="wrap">
          <div className="contact-grid">
            <div className="card d-formcard">
              <h2 className="d-formcard-h">Napisz wiadomość</h2>
              <ContactForm />
            </div>
            <div className="contact-side">
              <div className="icard">
                <div className="ico" aria-hidden="true">
                  <Mail />
                </div>
                <h2>E-mail</h2>
                <p>
                  <a href="mailto:kontakt@verris.pl">kontakt@verris.pl</a>
                  <br />
                  Odpowiadamy zwykle w ciągu dnia roboczego.
                </p>
              </div>
              <div className="icard">
                <div className="ico" aria-hidden="true">
                  <LifeBuoy />
                </div>
                <h2>Masz już konto?</h2>
                <p>
                  Najszybciej pomożemy przez zgłoszenie w <a href={PANEL}>panelu klienta</a> — od razu widzimy Twoje
                  usługi.
                </p>
              </div>
              <div className="icard">
                <div className="ico" aria-hidden="true">
                  <Activity />
                </div>
                <h2>Coś nie działa?</h2>
                <p>
                  Sprawdź najpierw <a href="https://status.verris.pl">status usług</a>. Jeśli trwa awaria, informujemy
                  tam na bieżąco.
                </p>
              </div>
              <div className="icard">
                <div className="ico" aria-hidden="true">
                  <Building2 />
                </div>
                <h2>Dane firmy</h2>
                <p>
                  HVLN Dominik Kowalski
                  <br />
                  Zielona Góra · NIP 9292069367
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

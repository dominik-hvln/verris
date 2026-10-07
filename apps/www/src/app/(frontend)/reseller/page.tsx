import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead } from '../components/ui';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Program resellerski — hosting dla klientów agencji | Verris',
  description:
    'Program resellerski Verris dla agencji i freelancerów: klienci rejestrują się z Twojego linku, a Ty obsługujesz ich usługi z jednego panelu. Przejrzyste rozliczenia i program poleceń. Własny narzut — wkrótce.',
  alternates: { canonical: '/reseller' },
};

const ZYSKI: [string, string][] = [
  ['Jeden panel', 'Wszyscy klienci i usługi w jednym miejscu. Mniej przełączania, mniej klikania.'],
  ['Przejrzyste rozliczenia', 'Uczciwe zasady rozliczeń i program poleceń z prowizją (szczegóły w panelu).'],
  ['Dla agencji i freelancerów', 'Obsłuż wielu klientów bez budowania własnej infrastruktury.'],
  ['Własny narzut — wkrótce', 'Pracujemy nad narzutem doliczanym do cen dla Twoich klientów. Do tego czasu płacą oni ceny z cennika Verris.'],
];

const FAQ: [string, string][] = [
  ['Jak klienci trafiają do mojego programu?', 'Zapraszasz ich do Verris swoim linkiem, a ich usługi obsługujesz z jednego panelu.'],
  ['Ile zapłacą moi klienci?', 'Do czasu wprowadzenia własnego narzutu — ceny z cennika Verris.'],
  ['Gdzie poznam warunki programu?', 'Załóż konto i zapytaj o warunki programu resellerskiego w panelu; szczegóły prowizji z programu poleceń są w panelu.'],
];

export default function Page() {
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'Program resellerski',
          description:
            'Hosting Verris dla klientów agencji i freelancerów — klienci z Twojego linku, ich usługi w jednym panelu.',
          path: '/reseller',
        })}
      />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Reseller' }]} />
            <h1>Hosting dla Twoich klientów</h1>
            <p className="lead">
              Prowadzisz agencję webową albo obsługujesz wielu klientów? Zaproś ich do Verris swoim linkiem i obsługuj
              ich usługi z jednego panelu.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero">
                Zostań resellerem
              </Button>
              <Button href="/hosting" variant="ghost" cta="subhero-alt">
                Zobacz hosting
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">Program resellerski</h2>
            <dl>
              <div>
                <dt>Klienci</dt>
                <dd>z Twojego linku</dd>
              </div>
              <div>
                <dt>Obsługa usług</dt>
                <dd>jeden panel</dd>
              </div>
              <div>
                <dt>Ceny dla klientów</dt>
                <dd>z cennika Verris</dd>
              </div>
              <div>
                <dt>Własny narzut</dt>
                <dd>wkrótce</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Korzyści" title="Dlaczego warto" />
          <div className="duo">
            {ZYSKI.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="Pytania" title="Częste pytania o program" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Skaluj biznes agencji z Verris"
        text="Załóż konto i zapytaj o warunki programu resellerskiego w panelu."
        primaryLabel="Przejdź do panelu"
        secondary={{ label: 'Napisz do nas', href: '/kontakt' }}
      />
    </main>
  );
}

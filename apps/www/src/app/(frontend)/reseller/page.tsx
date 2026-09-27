import type { Metadata } from 'next';
import { Users, Wallet, LayoutPanelLeft, Tag } from 'lucide-react';
import { SubHero, CTABand, JsonLd } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Program resellerski — hosting dla klientów agencji | Verris',
  description:
    'Program resellerski Verris dla agencji i freelancerów: klienci rejestrują się z Twojego linku, a Ty obsługujesz ich usługi z jednego panelu. Przejrzyste rozliczenia i program poleceń. Własny narzut — wkrótce.',
  alternates: { canonical: '/reseller' },
};

const F = [
  { icon: Tag, h: 'Własny narzut — wkrótce', p: 'Pracujemy nad narzutem doliczanym do cen dla Twoich klientów. Do tego czasu płacą oni ceny z cennika Verris.' },
  { icon: LayoutPanelLeft, h: 'Jeden panel', p: 'Wszyscy klienci i usługi w jednym miejscu. Mniej przełączania, mniej klikania.' },
  { icon: Wallet, h: 'Przejrzyste rozliczenia', p: 'Uczciwe zasady rozliczeń i program poleceń z prowizją (szczegóły w panelu).' },
  { icon: Users, h: 'Dla agencji i freelancerów', p: 'Obsłuż wielu klientów bez budowania własnej infrastruktury.' },
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
      <SubHero
        eyebrow="Program resellerski"
        title="Hosting dla Twoich klientów"
        lead="Prowadzisz agencję webową albo obsługujesz wielu klientów? Zaproś ich do Verris swoim linkiem i obsługuj ich usługi z jednego panelu."
        crumbs={[{ label: 'Reseller' }]}
        primary={{ label: 'Zostań resellerem', href: PANEL }}
        secondary={{ label: 'Zobacz hosting', href: '/hosting' }}
      />
      <section>
        <div className="wrap">
          <div className="grid-2">
            {F.map((f) => {
              const Icon = f.icon;
              return (
                <div className="icard rv" key={f.h}>
                  <div className="ico"><Icon /></div>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <CTABand
        title="Skaluj biznes agencji z Verris"
        text="Załóż konto i zapytaj o warunki programu resellerskiego w panelu."
        primaryLabel="Przejdź do panelu"
        secondary={{ label: 'Napisz do nas', href: '/kontakt' }}
      />
      <RevealInit />
    </main>
  );
}

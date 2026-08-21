import type { Metadata } from 'next';
import { Users, Wallet, LayoutPanelLeft, Tag } from 'lucide-react';
import { SubHero, CTABand, JsonLd } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Program resellerski — hosting pod własną marką | Verris',
  description:
    'Odsprzedawaj hosting Verris pod własną marką agencji lub freelancera. Wielu klientów z jednego panelu, przewidywalne rozliczenia i program poleceń. Mniej klikania, większa marża.',
  alternates: { canonical: '/reseller' },
};

const F = [
  { icon: Tag, h: 'Własna marka', p: 'Sprzedawaj usługi pod szyldem swojej agencji — klient widzi Ciebie, nie nas.' },
  { icon: LayoutPanelLeft, h: 'Jeden panel', p: 'Wszyscy klienci i usługi w jednym miejscu. Mniej przełączania, mniej klikania.' },
  { icon: Wallet, h: 'Przewidywalna marża', p: 'Uczciwe zasady rozliczeń i program poleceń z prowizją (szczegóły w panelu).' },
  { icon: Users, h: 'Dla agencji i freelancerów', p: 'Obsłuż wielu klientów bez budowania własnej infrastruktury.' },
];

export default function Page() {
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'Program resellerski',
          description:
            'Odsprzedaż hostingu Verris pod własną marką agencji lub freelancera. Wielu klientów z jednego panelu, przewidywalna marża.',
          path: '/reseller',
        })}
      />
      <SubHero
        eyebrow="Program resellerski"
        title="Hosting pod Twoją marką"
        lead="Prowadzisz agencję webową albo obsługujesz wielu klientów? Odsprzedawaj hosting Verris jako swój — z jednego panelu, z przewidywalną marżą."
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

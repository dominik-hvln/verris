import type { Metadata } from 'next';
import { Gauge, Move, ShieldCheck, Database, RefreshCw, FileText, Activity } from 'lucide-react';
import { SubHero, CTABand } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { features } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Funkcje hostingu Verris — autoskalowanie, migracja, SSL, SLA',
  description:
    'Wszystkie funkcje hostingu Verris w jednym miejscu: autoskalowanie, darmowa migracja, SSL w cenie, kopie zapasowe z siatką bezpieczeństwa, domeny bez auto-odnowień, RODO/DPA i SLA 99,5% z rekompensatami.',
  alternates: { canonical: '/funkcje' },
};

const ICONS: Record<string, typeof Gauge> = {
  autoskalowanie: Gauge,
  migracja: Move,
  ssl: ShieldCheck,
  'kopie-zapasowe': Database,
  'domeny-bez-auto-odnowien': RefreshCw,
  'rodo-i-dpa': FileText,
  sla: Activity,
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Funkcje"
        title="Konkrety, które mają pokrycie"
        lead="Każda funkcja Verris wynika z regulaminu albo ze specyfikacji usługi — nie z marketingowej waty. Zobacz, co dokładnie dostajesz."
        crumbs={[{ label: 'Funkcje' }]}
      />
      <section>
        <div className="wrap">
          <div className="grid-3">
            {features.map((f) => {
              const Icon = ICONS[f.slug] ?? Gauge;
              return (
                <a className="icard rv" href={`/funkcje/${f.slug}`} key={f.slug}>
                  <div className="ico"><Icon /></div>
                  <h3>{f.title}</h3>
                  <p>{f.lead}</p>
                </a>
              );
            })}
          </div>
        </div>
      </section>
      <CTABand
        title="Hosting bez gwiazdek"
        text="Jedna cena, autoskalowanie i funkcje w komplecie — 39 zł/mies lub 349 zł/rok brutto."
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <RevealInit />
    </main>
  );
}

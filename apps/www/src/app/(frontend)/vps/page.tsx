import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead } from '../components/ui';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';
import { notFound } from 'next/navigation';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';

export const metadata: Metadata = {
  title: 'VPS — serwery z pełnym dostępem root | Verris',
  description:
    'Niezarządzane serwery VPS z pełnym dostępem administracyjnym (root). Przewidywalne zasoby, infrastruktura w UE (Niemcy/Finlandia). Dla deweloperów i startupów. Konfiguracja i wycena w panelu.',
  alternates: { canonical: '/vps' },
};

const ZYSKI: [string, string][] = [
  ['Pełny root', 'Niezarządzany VPS — instalujesz i konfigurujesz, co chcesz. Pełna kontrola nad środowiskiem.'],
  ['Przewidywalne zasoby', 'Dedykowane vCPU i RAM bez niespodzianek. Zasoby, za które płacisz, są Twoje.'],
  ['SLA w umowie', 'SLA 99,5% z rekompensatami na wniosek wg regulaminu — dotyczy także usług VPS.'],
];

const FAQ: [string, React.ReactNode][] = [
  [
    'VPS czy hosting współdzielony?',
    <>
      Jeśli prowadzisz stronę, bloga albo sklep i chcesz, żeby „po prostu działało” — wybierz{' '}
      <Link href="/hosting">hosting z autoskalowaniem</Link>. VPS ma sens, gdy potrzebujesz własnego środowiska,
      niestandardowego stacku albo pełnej kontroli nad serwerem i nie przeszkadza Ci samodzielna administracja.
    </>,
  ],
  [
    'Czy VPS jest zarządzany?',
    'Nie. VPS w Verris jest niezarządzany — nie konfigurujemy go za Ciebie. Konfigurację i aktualną wycenę zasobów znajdziesz w panelu.',
  ],
];

export default function VpsPage() {
  // Do wejścia VPS do sprzedaży strona nie istnieje (decyzja 2026-09-24) — w panelu nie da się go kupić.
  if (!VPS_W_SPRZEDAZY) notFound();
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'VPS — serwery wirtualne',
          description:
            'Niezarządzane serwery VPS z pełnym dostępem root. Przewidywalne zasoby, infrastruktura w UE (Niemcy/Finlandia). SLA 99,5% z rekompensatami.',
          path: '/vps',
        })}
      />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'VPS' }]} />
            <h1>VPS z pełnym dostępem root</h1>
            <p className="lead">
              Niezarządzane serwery dla tych, którzy chcą pełnej kontroli. Przewidywalne zasoby, infrastruktura w Unii
              Europejskiej i uczciwe zasady rozliczeń.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero" conv="checkout_intent" plan="vps">
                Skonfiguruj VPS
              </Button>
              <Button href="/hosting" variant="ghost" cta="subhero-alt">
                Porównaj z hostingiem
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">VPS w skrócie</h2>
            <dl>
              <div>
                <dt>Dostęp</dt>
                <dd>pełny root</dd>
              </div>
              <div>
                <dt>Zarządzanie</dt>
                <dd>niezarządzany</dd>
              </div>
              <div>
                <dt>Infrastruktura</dt>
                <dd>UE (Niemcy/Finlandia)</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>99,5%</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Korzyści" title="Pełna kontrola, przewidywalne zasoby" />
          <div className="grid3">
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
          <SectionHead eyebrow="Pytania" title="VPS czy hosting?" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Gotowy na własny serwer?"
        text="Skonfiguruj VPS w panelu i zacznij w kilka minut."
        primaryLabel="Przejdź do panelu"
        secondary={{ label: 'Zobacz hosting', href: '/hosting' }}
      />
    </main>
  );
}

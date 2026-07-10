import type { Metadata } from 'next';
import { Terminal, Cpu, ShieldCheck, MapPin } from 'lucide-react';
import { SubHero, CTABand, JsonLd } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'VPS — serwery z pełnym dostępem root | Verris',
  description:
    'Niezarządzane serwery VPS z pełnym dostępem administracyjnym (root). Przewidywalne zasoby, infrastruktura w UE (Hetzner). Dla deweloperów i startupów. Konfiguracja i wycena w panelu.',
  alternates: { canonical: '/vps' },
};

const F = [
  { icon: Terminal, h: 'Pełny root', p: 'Niezarządzany VPS — instalujesz i konfigurujesz, co chcesz. Pełna kontrola nad środowiskiem.' },
  { icon: Cpu, h: 'Przewidywalne zasoby', p: 'Dedykowane vCPU i RAM bez niespodzianek. Zasoby, za które płacisz, są Twoje.' },
  { icon: MapPin, h: 'Serwery w UE', p: 'Infrastruktura Hetzner (Niemcy/Finlandia). Dane w EOG — prościej o zgodność z RODO.' },
  { icon: ShieldCheck, h: 'SLA w umowie', p: 'SLA 99,5% z rekompensatami wg regulaminu — dotyczy także usług VPS.' },
];

export default function VpsPage() {
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'VPS — serwery wirtualne',
          description:
            'Niezarządzane serwery VPS z pełnym dostępem root. Przewidywalne zasoby, infrastruktura w UE (Hetzner). SLA 99,5% z rekompensatami.',
          path: '/vps',
        })}
      />
      <SubHero
        eyebrow="Serwery wirtualne"
        title="VPS z pełnym dostępem root"
        lead="Niezarządzane serwery dla tych, którzy chcą pełnej kontroli. Przewidywalne zasoby, infrastruktura w Unii Europejskiej i uczciwe zasady rozliczeń."
        crumbs={[{ label: 'VPS' }]}
        primary={{ label: 'Skonfiguruj VPS', href: PANEL, conv: 'checkout_intent', plan: 'vps' }}
        secondary={{ label: 'Porównaj z hostingiem', href: '/hosting' }}
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
      <section className="band">
        <div className="wrap">
          <div className="prose rv">
            <h2>VPS czy hosting współdzielony?</h2>
            <p>
              Jeśli prowadzisz stronę, bloga albo sklep i chcesz, żeby „po prostu działało" —
              wybierz <a href="/hosting">hosting z autoskalowaniem</a>. VPS ma sens, gdy potrzebujesz
              własnego środowiska, niestandardowego stacku albo pełnej kontroli nad serwerem i nie
              przeszkadza Ci samodzielna administracja.
            </p>
            <p>
              VPS w Verris jest <strong>niezarządzany</strong> — nie konfigurujemy go za Ciebie.
              Konfigurację i aktualną wycenę zasobów znajdziesz w panelu.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Gotowy na własny serwer?"
        text="Skonfiguruj VPS w panelu i zacznij w kilka minut."
        primaryLabel="Przejdź do panelu"
        secondary={{ label: 'Zobacz hosting', href: '/hosting' }}
      />
      <RevealInit />
    </main>
  );
}

import type { Metadata } from 'next';
import { Globe, BellRing, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import { SubHero, CTABand, JsonLd } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Domeny — rejestracja i transfer bez pułapek | Verris',
  description:
    'Rejestracja, transfer i utrzymanie domen. Bez cichego auto-odnowienia z karty — przypominamy 30, 14 i 7 dni przed wygaśnięciem, a decyzję zostawiamy Tobie. Sprawdź dostępność w panelu.',
  alternates: { canonical: '/domeny' },
};

const F = [
  { icon: BellRing, h: 'Bez cichych auto-odnowień', p: 'Zamiast automatycznie pobierać z karty, przypominamy 30, 14 i 7 dni przed wygaśnięciem. Ty decydujesz.' },
  { icon: ArrowLeftRight, h: 'Transfer w każdej chwili', p: 'Przeniesiesz domenę do Verris lub od Verris kiedy chcesz — bez blokad i sztuczek.' },
  { icon: Globe, h: 'Domena + hosting w jednym', p: 'Podłącz domenę do hostingu z autoskalowaniem i zarządzaj wszystkim z jednego panelu.' },
  { icon: ShieldCheck, h: 'Jasne warunki', p: 'Rejestracja domeny jest nieodwracalna — informujemy o tym wprost, bez ukrytych zapisów.' },
];

export default function DomenyPage() {
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'Rejestracja i transfer domen',
          description:
            'Rejestracja, transfer i utrzymanie domen bez cichych auto-odnowień. Przypomnienia 30/14/7 dni przed wygaśnięciem.',
          path: '/domeny',
        })}
      />
      <SubHero
        eyebrow="Domeny"
        title="Domeny bez pułapek odnowień"
        lead="Rejestracja i transfer domen z uczciwymi zasadami. Bez cichego pobierania z karty i bez blokad transferu — tak jak powinno być."
        crumbs={[{ label: 'Domeny' }]}
        primary={{ label: 'Wyszukaj domenę', href: PANEL, conv: 'generate_lead' }}
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
      <section className="band">
        <div className="wrap">
          <div className="prose rv">
            <h2>Domena u obecnego rejestratora? Nie musisz jej przenosić</h2>
            <p>
              Żeby uruchomić stronę na Verris, nie musisz przenosić domeny. Wystarczy zmienić rekordy
              DNS, aby wskazywały na nasze serwery — domena może zostać tam, gdzie jest. Transfer jest
              opcjonalny i zrobisz go w dowolnym momencie. Więcej o samym przenoszeniu strony
              przeczytasz na stronie <a href="/przenies-strone">migracji</a>.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Znajdź domenę dla swojej strony"
        text="Sprawdź dostępność i ceny w panelu — a hosting dołóż w tej samej chwili."
        primaryLabel="Wyszukaj domenę"
        secondary={{ label: 'Cennik hostingu', href: '/cennik' }}
      />
      <RevealInit />
    </main>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead } from '../components/ui';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Domeny — rejestracja i transfer bez pułapek | Verris',
  description:
    'Rejestracja, transfer i utrzymanie domen. Bez cichego auto-odnowienia z karty — przypominamy 30, 14 i 7 dni przed wygaśnięciem, a decyzję zostawiamy Tobie. Sprawdź dostępność w panelu.',
  alternates: { canonical: '/domeny' },
};

const ZASADY: [string, string][] = [
  ['Bez cichych auto-odnowień', 'Zamiast automatycznie pobierać z karty, przypominamy 30, 14 i 7 dni przed wygaśnięciem. Ty decydujesz.'],
  ['Transfer w każdej chwili', 'Przeniesiesz domenę do Verris lub od Verris kiedy chcesz — bez blokad i sztuczek.'],
  ['Domena + hosting w jednym', 'Podłącz domenę do hostingu z autoskalowaniem i zarządzaj wszystkim z jednego panelu.'],
  ['Jasne warunki', 'Rejestracja domeny jest nieodwracalna — informujemy o tym wprost, bez ukrytych zapisów.'],
];

const FAQ: [string, string][] = [
  [
    'Czy muszę przenosić domenę, żeby uruchomić stronę na Verris?',
    'Nie. Wystarczy zmienić rekordy DNS, aby wskazywały na nasze serwery — domena może zostać u obecnego rejestratora. Transfer jest opcjonalny i zrobisz go w dowolnym momencie.',
  ],
  [
    'Czy domena odnowi się sama?',
    'Nie. Zamiast cichego pobierania z karty przypominamy 30, 14 i 7 dni przed wygaśnięciem, a decyzję zostawiamy Tobie.',
  ],
  [
    'Kto zarządza blokadą transferu?',
    'Ty — blokadę transferu włączasz i zdejmujesz sam w panelu.',
  ],
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

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Domeny' }]} />
            <h1>Domeny bez pułapek odnowień</h1>
            <p className="lead">
              Rejestracja i transfer domen z uczciwymi zasadami. Bez cichego pobierania z karty, a blokadę transferu
              włączasz i zdejmujesz sam w panelu — tak jak powinno być.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero">
                Wyszukaj domenę
              </Button>
              <Button href="/hosting" variant="ghost" cta="subhero-alt">
                Zobacz hosting
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">Zasady domen</h2>
            <dl>
              <div>
                <dt>Odnowienie</dt>
                <dd>tylko z Twojej decyzji</dd>
              </div>
              <div>
                <dt>Przypomnienia</dt>
                <dd>30, 14 i 7 dni</dd>
              </div>
              <div>
                <dt>Transfer</dt>
                <dd>w każdej chwili</dd>
              </div>
              <div>
                <dt>Blokada transferu</dt>
                <dd>sam w panelu</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Zasady" title="Domeny na uczciwych warunkach" />
          <div className="duo">
            {ZASADY.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap narrow">
          <SectionHead
            eyebrow="Masz już domenę"
            title="Domena u obecnego rejestratora? Nie musisz jej przenosić"
            lead={
              <>
                Żeby uruchomić stronę na Verris, wystarczy zmienić rekordy DNS, aby wskazywały na nasze serwery. Więcej o
                samym przenoszeniu strony przeczytasz na stronie <Link href="/przenies-strone">migracji</Link>.
              </>
            }
          />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Znajdź domenę dla swojej strony"
        text="Sprawdź dostępność i ceny w panelu — a hosting dołóż w tej samej chwili."
        primaryLabel="Wyszukaj domenę"
        secondary={{ label: 'Cennik hostingu', href: '/cennik' }}
      />
    </main>
  );
}

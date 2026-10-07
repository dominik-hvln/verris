import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, SectionHead, StickyBuy, Steps } from '../../components/ui';
import { KROKI_MIGRACJI } from '@/lib/migracja';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Hosting WordPress z autoskalowaniem | Verris',
  description:
    'Hosting WordPress zoptymalizowany pod WP: obsługa starych wersji PHP, kopie z odtwarzaniem, SSL i migracja za 0 zł. Autoskalowanie łapie piki ruchu. 45 zł/mies lub 449 zł/rok brutto.',
  alternates: { canonical: '/hosting/wordpress' },
};

// Tylko to, co /specyfikacja publikuje bez czekania na węzeł (SPEC_PO_WERYFIKACJI): bez LiteSpeed, Redis, WAF i ImunifyAV.
const ZYSKI: { t: string; p: string }[] = [
  { t: 'Autoskalowanie', p: 'CPU, RAM i dysk rosną z ruchem — pik kampanii nie kładzie strony, a po nim moc wraca do bazy.' },
  { t: 'Stare wersje PHP', p: 'PHP 7.4–8.3, osobno dla każdej domeny — gdy motyw lub wtyczka jeszcze nie nadążyły.' },
  { t: 'Instalacja i staging', p: 'WordPress jednym kliknięciem i kopia testowa (staging), na której sprawdzisz aktualizację przed wdrożeniem.' },
  { t: 'Kopie z odtwarzaniem', p: 'Kopie z 30 dni poza serwerem. Samodzielnie przywrócisz pliki, bazę lub pocztę — z kopią bezpieczeństwa przed operacją.' },
  { t: 'SSL w cenie', p: "Certyfikat Let's Encrypt dla każdej domeny, także wildcard. Dopłata: 0 zł." },
  { t: 'Migracja za 0 zł', p: 'Zespół przeniesie pliki, bazę i konfigurację albo zrobisz to migratorem w panelu.' },
];

const FAQ: [string, string][] = [
  [
    'Jak przenieść stronę WordPress na Verris?',
    'Przeniesienie WordPressa to skopiowanie plików, bazy danych i konfiguracji na nowy serwer. W Verris zrobi to za Ciebie zespół w ramach darmowej migracji — wystarczy przekazać dostępy do obecnego hostingu. Możesz też użyć migratora w panelu, który przeniesie pliki i bazę samodzielnie, krok po kroku.',
  ],
  [
    'Co, jeśli aktualizacja wtyczki zepsuje stronę?',
    'Przywrócisz kopię w panelu, wybierając pliki, bazę lub pocztę. System domyślnie robi kopię bezpieczeństwa przed przywróceniem, więc operację można cofnąć.',
  ],
  [
    'Ile kosztuje hosting WordPress?',
    'Jeden pakiet: 45 zł/mies lub 449 zł/rok brutto. Migracja i SSL są w cenie, a odnowienie następuje po cenie z cennika. Dodatkowa moc w piku jest rozliczana godzinowo, w blokach po 15 minut.',
  ],
];

export default function Page() {
  return (
    <main>
      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'WordPress' }]} />
            <h1>WordPress, który wytrzyma pik</h1>
            <p className="lead">
              Hosting zoptymalizowany pod WordPress. Gdy wpis wejdzie na home albo ruszy kampania, autoskalowanie doda
              mocy — a po piku ją zwolni. Bez pakietu na zapas.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero" conv="checkout_intent" plan="hosting">
                Załóż konto
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="subhero-alt">
                Przenieś WordPressa
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">Dla WordPressa w abonamencie</h2>
            <dl>
              <div>
                <dt>PHP</dt>
                <dd>7.4–8.3, osobno dla domeny</dd>
              </div>
              <div>
                <dt>Instalacja</dt>
                <dd>jednym kliknięciem</dd>
              </div>
              <div>
                <dt>Staging</dt>
                <dd>kopia testowa</dd>
              </div>
              <div>
                <dt>SSL i migracja</dt>
                <dd>0 zł</dd>
              </div>
            </dl>
            <h2 className="incl-h">W piku, automatycznie</h2>
            <p className="incl-peak">do 24 vCPU · 64 GB RAM · 1000 GB</p>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Korzyści" title="Dlaczego WordPress na Verris" />
          <div className="grid3">
            {ZYSKI.map((z) => (
              <Card key={z.t}>
                <h3>{z.t}</h3>
                <p>{z.p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead
            eyebrow="Przeprowadzka"
            title="Przenieś istniejącą stronę WordPress"
            lead={
              <>
                Wystarczy przekazać dostępy, resztą zajmie się zespół — albo użyj migratora w panelu. Szczegóły na stronie{' '}
                <Link href="/przenies-strone">przeniesienia strony</Link>.
              </>
            }
          />
          <Steps items={KROKI_MIGRACJI} />
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="Pytania" title="Częste pytania o WordPress" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Postaw WordPressa na hostingu bez gwiazdek"
        text="45 zł/mies lub 449 zł/rok brutto — migracja i SSL w cenie."
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <StickyBuy />
    </main>
  );
}

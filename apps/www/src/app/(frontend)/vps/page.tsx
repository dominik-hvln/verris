import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead } from '../components/ui';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';
import { faqSchema, graph, serviceSchema } from '@/lib/schema';
import { PANEL } from '@/lib/site';

/*
 * Makieta 14.10 (plansza Vps). Strona istnieje tylko przy VPS_W_SPRZEDAZY (decyzja 2026-09-24).
 * Funkcje sprawdzone w panelu klienta (dashboard/vps: snapshoty, przywracanie, reinstalacja, konsola, restart,
 * klucze SSH). Plany i ceny z makiety to placeholdery — wycena zostaje w panelu. Bez lokalizacji serwerów (brief).
 */
export const metadata: Metadata = {
  title: 'VPS — serwery z pełnym dostępem root | Verris',
  description:
    'Niezarządzane serwery VPS z pełnym dostępem root: dedykowane vCPU i RAM, snapshoty, reinstalacja i konsola w panelu. Dane w UE, wycena w panelu.',
  alternates: { canonical: '/vps' },
};

const KONKRETY: [string, string][] = [
  ['Pełny root', 'Własny system, własne pakiety, własna zapora. Klucze SSH dodajesz w panelu.'],
  ['Snapshoty', 'Zrób snapshot przed aktualizacją systemu i przywróć go z panelu, gdy coś pójdzie nie tak.'],
  ['Reinstalacja i konsola', 'Restart, przeinstalowanie systemu i konsola awaryjna w panelu, bez zgłoszeń.'],
  ['Przewidywalne zasoby', 'Dedykowane vCPU i RAM — zasoby, za które płacisz, są tylko Twoje. Cenę widzisz w panelu przed zamówieniem.'],
];

const POROWNANIE: [string, string, string][] = [
  ['Dla kogo', 'firmy, sklepy, WordPress', 'deweloperzy, aplikacje, własne usługi'],
  ['Kto dba o serwer', 'my', 'Ty'],
  ['Panel, poczta, kopie', 'w cenie', 'instalujesz sam, snapshoty w panelu'],
  ['Dostęp', 'SSH i Git na koncie', 'pełny root'],
  ['Moc w szczycie', 'rośnie sama (autoskalowanie)', 'zależy od wybranych zasobów'],
];

const FAQ: [string, string][] = [
  [
    'Czy VPS jest zarządzany?',
    'Nie. Dostajesz pełny root i sam dbasz o system, aktualizacje i bezpieczeństwo. Jeśli nie chcesz administrować serwerem, wybierz hosting z autoskalowaniem.',
  ],
  [
    'VPS czy hosting współdzielony?',
    'Jeśli prowadzisz stronę, bloga albo sklep i chcesz, żeby „po prostu działało” — wybierz hosting z autoskalowaniem. VPS ma sens, gdy potrzebujesz własnego środowiska, niestandardowego stacku albo pełnej kontroli nad serwerem.',
  ],
  [
    'Czy robicie kopie VPS?',
    'Snapshoty tworzysz sam w panelu, kiedy chcesz, i z panelu je przywracasz. Kopie danych wewnątrz serwera planujesz według własnych potrzeb.',
  ],
  ['Jakie jest SLA?', 'SLA 99,5% z rekompensatami na wniosek, według regulaminu — dotyczy także usług VPS.'],
];

export default function VpsPage() {
  // Do wejścia VPS do sprzedaży strona nie istnieje (decyzja 2026-09-24) — w panelu nie da się go kupić.
  if (!VPS_W_SPRZEDAZY) notFound();

  const jsonLd = graph(
    serviceSchema({
      name: 'VPS — serwery wirtualne',
      description:
        'Niezarządzane serwery VPS z pełnym dostępem root: dedykowane vCPU i RAM, snapshoty, reinstalacja i konsola w panelu. Dane w UE. SLA 99,5% z rekompensatami.',
      path: '/vps',
    }),
    faqSchema(FAQ),
  );

  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'VPS' }]} />
            <span className="eyebrow" style={{ marginTop: 18 }}>
              Serwery VPS
            </span>
            <h1>
              Serwer VPS z pełnym rootem. <span className="mint">Twoje zasady</span>
            </h1>
            <p className="lead">
              Dla deweloperów, startupów i agencji, które wiedzą, czego chcą. Dedykowane vCPU i RAM, snapshoty przed każdą
              większą zmianą i konsola awaryjna w panelu. Dane w Unii Europejskiej.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero" conv="checkout_intent" plan="vps">
                Skonfiguruj VPS
              </Button>
              <Button href="#porownanie" variant="ghost" cta="subhero-alt">
                VPS czy hosting?
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">VPS w skrócie</h2>
            <dl>
              <div>
                <dt>Dostęp</dt>
                <dd>pełny root, klucze SSH</dd>
              </div>
              <div>
                <dt>Zarządzanie</dt>
                <dd>niezarządzany</dd>
              </div>
              <div>
                <dt>Snapshoty</dt>
                <dd>w panelu</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>99,5%</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="b-vps-konkrety">
        <div className="wrap">
          <SectionHead id="b-vps-konkrety" eyebrow="Konkrety" title="Konkrety dla tych, którzy znają się na rzeczy" />
          <div className="b-grid4">
            {KONKRETY.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
          <p className="b-przypis">
            VPS jest niezarządzany: system, aktualizacje i bezpieczeństwo serwera należą do Ciebie. Jeśli wolisz, żeby o
            serwer dbał ktoś inny, wybierz <Link href="/hosting">hosting z autoskalowaniem</Link>.
          </p>
        </div>
      </section>

      <section className="sec sec-alt" id="porownanie" aria-labelledby="b-vps-cmp">
        <div className="wrap">
          <SectionHead id="b-vps-cmp" eyebrow="Porównanie" title="VPS czy hosting? Wybierz w 30 sekund" />
          <div className="b-tabela">
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="b-sr">Cecha</span>
                  </th>
                  <th scope="col">Hosting z autoskalowaniem</th>
                  <th scope="col">VPS</th>
                </tr>
              </thead>
              <tbody>
                {POROWNANIE.map(([k, h, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{h}</td>
                    <td className="vr">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="b-przypis">
            Nie wiesz, co wybrać? Przeczytaj przewodnik <Link href="/jak-wybrac-hosting">jak wybrać hosting</Link>.
          </p>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="FAQ" title="Pytania o VPS" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Gotowy na własny serwer?"
        text="Skonfiguruj VPS w panelu — zasoby i cenę zobaczysz przed zamówieniem."
        primaryLabel="Przejdź do panelu"
        primaryHref={PANEL}
        secondary={{ label: 'Zobacz hosting', href: '/hosting' }}
      />
    </main>
  );
}

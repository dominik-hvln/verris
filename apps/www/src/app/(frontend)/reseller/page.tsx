import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, Steps } from '../components/ui';
import { PANEL } from '@/lib/site';
import { faqSchema, serviceSchema } from '@/lib/schema';
import { SPEC_PO_WERYFIKACJI } from '@/lib/oferta';
import { POLECENIA } from '@/lib/polecenia';

const OPIS =
  'Obsługuj strony klientów z jednego panelu Verris: szybki hosting, przeprowadzki za 0 zł, subkonta z uprawnieniami i prowizja z programu poleceń.';

export const metadata: Metadata = {
  title: 'Hosting dla agencji — program partnerski | Verris',
  description: OPIS,
  alternates: { canonical: '/reseller' },
};

/*
 * Warunki tylko z kodu: wniosek w panelu i zatwierdzenie (apps/api/src/reseller/reseller.service.ts, O-08),
 * podgląd usług klientów bez plików, poczty i faktur (reseller-klienci.service.ts, O-05), odpięcie przez
 * klienta (partner-klienta.controller.ts). Narzut resellera (O-07) jest za flagą FEATURE_RESELLER_MARKUP —
 * domyślnie wyłączony, więc klienci płacą cennik Verris, a na stronie „własny narzut — wkrótce”.
 */
const ZYSKI: [string, string][] = [
  [
    'Mniej pracy przy utrzymaniu',
    'Kopie zapasowe, certyfikaty SSL i zabezpieczenia serwera są po naszej stronie. Ty zajmujesz się projektami.',
  ],
  [
    'Szybkie strony, zadowoleni klienci',
    SPEC_PO_WERYFIKACJI
      ? 'LiteSpeed, dyski NVMe i autoskalowanie. Kampania klienta nie położy jego sklepu.'
      : 'Dyski NVMe i autoskalowanie. Kampania klienta nie położy jego sklepu.',
  ],
  ['Przeprowadzki w cenie', 'Przenosimy strony klientów od obecnych dostawców za 0 zł.'],
  ['Subkonta z uprawnieniami', 'Klient daje Ci dostęp tylko do tego, przy czym masz pracować.'],
  ['Kopia testowa jednym kliknięciem', 'Sprawdzasz zmiany na kopii testowej (staging), zanim zobaczy je klient.'],
  [
    'Prowizja z poleceń',
    `W programie poleceń dostajesz ${POLECENIA.prowizjaPct}% od płatności klientów, którzy założą konto z Twojego linku polecającego.`,
  ],
];

const KROKI = [
  { label: '01', title: 'Załóż konto', text: 'Rejestracja w panelu zajmuje kilka minut.' },
  {
    label: '02',
    title: 'Złóż wniosek o program',
    text: 'Wniosek wysyłasz w panelu. Po zatwierdzeniu dostajesz link zaproszenia dla klientów.',
  },
  {
    label: '03',
    title: 'Zaproś klientów',
    text: 'Klient zakłada konto z Twojego linku, a Ty widzisz jego usługi w jednym panelu.',
  },
  { label: '04', title: 'Przenieśmy ich strony', text: 'Przeprowadzki robimy za Ciebie, bez przerwy w działaniu.' },
];

const FAQ: [string, string][] = [
  [
    'Ile zapłacą moi klienci?',
    'Ceny z cennika Verris. Pracujemy nad własnym narzutem, który doliczysz do cen dla swoich klientów — do tego czasu klienci płacą cennik.',
  ],
  [
    'Co widzę na kontach klientów?',
    'Usługi i ich stan: domenę, pakiet, status, stan działania i termin odnowienia. Nie widzisz plików, baz, poczty, faktur ani salda klienta.',
  ],
  [
    'Jak pracuję przy stronie klienta?',
    'Klient nadaje Ci dostęp przez subkonto z wybranymi uprawnieniami. Tak samo możesz obsługiwać klientów, którzy mają już konto w Verris.',
  ],
  [
    'Czy klient może zrezygnować z mojej obsługi?',
    'Tak. Klient zawsze widzi w panelu, kto prowadzi jego konto, i może się odpiąć. Jego konto i usługi zostają bez zmian.',
  ],
  [
    'Jak wypłacana jest prowizja?',
    `Według zasad programu poleceń: po ${POLECENIA.karencjaDni} dniach karencji przenosisz ją na portfel Kredytów albo zlecasz przelew (od ${POLECENIA.minWyplataZl} zł).`,
  ],
];

export default function Page() {
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'Program partnerski dla agencji',
          description: OPIS,
          path: '/reseller',
        })}
      />
      <JsonLd data={faqSchema(FAQ)} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Dla agencji' }]} />
            <p className="kicker">Dla agencji i freelancerów</p>
            <h1>Twoi klienci w jednym panelu. Ty masz spokój, oni szybkie strony</h1>
            <p className="lead">
              Robisz strony dla innych? Zaproś klientów do Verris swoim linkiem i obsługuj ich usługi z jednego
              miejsca. Bez kilkunastu loginów i bez tłumaczenia każdemu, gdzie jest faktura.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero">
                Zostań partnerem
              </Button>
              <Button href="/kontakt" variant="ghost" cta="subhero-alt">
                Napisz do nas
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">Program dla agencji</h2>
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
                <dt>Prowizja</dt>
                <dd>z programu poleceń</dd>
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
          <SectionHead eyebrow="Korzyści" title="Co zyskujesz jako agencja" />
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

      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead eyebrow="Start" title="Jak zacząć współpracę" />
          <Steps items={KROKI} variant="lista" />
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="Pytania" title="Pytania agencji" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Pokaż klientom hosting, za który nie będziesz się tłumaczyć"
        text="Zaproś pierwszego klienta, a przeprowadzkę jego strony weźmiemy na siebie."
        primaryLabel="Zostań partnerem"
        primaryHref={PANEL}
        conv={null}
        secondary={{ label: 'Program poleceń', href: '/polecaj' }}
      />
    </main>
  );
}

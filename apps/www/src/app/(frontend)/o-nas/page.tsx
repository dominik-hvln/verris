import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CTABand, JsonLd, SectionHead, SubHero } from '../components/ui';
import { SPEC_PO_WERYFIKACJI, SPECYFIKACJA_OPUBLIKOWANA } from '@/lib/oferta';
import { ZAMOW } from '@/lib/site';
import { organization, webPageSchema } from '@/lib/schema';

const OPIS =
  'Verris to polski hosting z autoskalowaniem: ta sama cena przy odnowieniu, przeniesienie strony za 0 zł i SLA 99,5% w regulaminie. Poznaj nasze zasady.';

export const metadata: Metadata = {
  title: 'O Verris — polski hosting z uczciwymi zasadami',
  description: OPIS,
  alternates: { canonical: '/o-nas' },
};

// „Verris w skrócie” — tylko fakty z cennika i specyfikacji (kopia poza serwerem: pozycja po weryfikacji na węźle).
const SKROT: [string, string][] = [
  ['Cena przy odnowieniu', 'ta sama'],
  ['Przeniesienie strony', '0 zł'],
  ['Dostępność w regulaminie', '99,5%'],
  ...(SPEC_PO_WERYFIKACJI ? ([['Kopia poza serwerem', 'z 30 dni']] as [string, string][]) : []),
  ['Język panelu i pomocy', 'polski'],
];

const ZASADY: [string, string][] = [
  [
    'Obietnice tylko z pokryciem',
    'Jeśli coś piszemy na stronie, to jest też w regulaminie. Dostępność 99,5% z rekompensatą, a nie „100%” na banerze.',
  ],
  [
    'Cena, która nie zaskakuje',
    'Odnowienie po cenie z cennika, ceny brutto podane wprost i bez cichych auto-odnowień domen.',
  ],
  ['Pomoc od człowieka', 'Odpowiadamy zwykle w ciągu dnia roboczego, konkretnie i po polsku. Bez skryptów.'],
  [
    'Konkret zamiast waty',
    SPECYFIKACJA_OPUBLIKOWANA
      ? 'Wszystkie parametry pakietu są publiczne w specyfikacji. Liczby mówią więcej niż przymiotniki.'
      : 'Podajemy parametry zamiast przymiotników. Liczby mówią więcej niż slogany.',
  ],
];

const LINKI: { t: string; p: string; more: string; href: string }[] = [
  {
    t: 'Dokumenty i RODO',
    p: 'Regulamin, polityka prywatności, umowa powierzenia i podprocesorzy.',
    more: 'Dokumenty',
    href: '/dokumenty',
  },
  ...(SPECYFIKACJA_OPUBLIKOWANA
    ? [{ t: 'Specyfikacja', p: 'Wszystkie parametry pakietu w jednej tabeli.', more: 'Parametry', href: '/specyfikacja' }]
    : []),
  {
    t: 'Status usług',
    p: 'Dostępność na żywo i historia incydentów.',
    more: 'Status',
    href: 'https://status.verris.pl',
  },
];

export default function Page() {
  return (
    <main>
      <JsonLd
        data={webPageSchema({
          type: 'AboutPage',
          name: 'O Verris',
          description: OPIS,
          path: '/o-nas',
          extra: {
            mainEntity: {
              ...organization,
              founder: { '@type': 'Person', name: 'Dominik Kowalski' },
            },
          },
        })}
      />

      <SubHero
        eyebrow="O Verris"
        title="Polski hosting, który gra w otwarte karty"
        lead="Verris powstał z prostej frustracji: tanie pierwsze lata, drogie odnowienia, gwiazdki w cennikach i pomoc, która odpisuje formułką. Postanowiliśmy zrobić hosting, któremu sami powierzylibyśmy swoje sklepy."
        crumbs={[{ label: 'O nas' }]}
        primary={{ label: 'Zobacz, co oferujemy', href: '/hosting' }}
        secondary={{ label: 'Napisz do nas', href: '/kontakt' }}
      />

      <section className="sec">
        <div className="wrap split">
          <div className="prose">
            <h2>Jak to się zaczęło</h2>
            <p>
              Za Verris stoi Dominik Kowalski, który na co dzień buduje strony i sklepy na WordPressie i
              WooCommerce. Przy kolejnych projektach klienci wracali z tymi samymi pytaniami: dlaczego odnowienie
              kosztuje kilka razy więcej niż pierwszy rok, dlaczego sklep nie wytrzymał ruchu w czasie promocji i
              kto przywróci stronę po nieudanej aktualizacji.
            </p>
            <p>
              Verris to odpowiedź na te pytania. Jeden uczciwy pakiet, moc, która rośnie razem z ruchem, i ludzie,
              którzy odpisują jak ludzie.
            </p>
          </div>
          <Card accent className="incl">
            <h3 className="incl-h">Verris w skrócie</h3>
            <dl>
              {SKROT.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead eyebrow="Zasady" title="W co wierzymy" />
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

      <section className="sec">
        <div className="wrap">
          <SectionHead
            eyebrow="Dane i dokumenty"
            title="Bezpieczne dane, jasne zasady"
            lead="Dane trzymamy w Unii Europejskiej. Umowę powierzenia danych akceptujesz w panelu, a listę firm, które pomagają nam świadczyć usługę, publikujemy otwarcie."
          />
          <div className="grid3">
            {LINKI.map((l) => (
              <Card key={l.t}>
                <h3>{l.t}</h3>
                <p>{l.p}</p>
                {l.href.startsWith('/') ? (
                  <Link href={l.href}>{l.more} →</Link>
                ) : (
                  <a href={l.href}>{l.more} →</a>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap narrow">
          <div className="prose">
            <h2>Kto świadczy usługę</h2>
            <p>
              Usługę świadczy <strong>HVLN Dominik Kowalski</strong> z siedzibą w Zielonej Górze, NIP 9292069367.
              Masz pytanie? <Link href="/kontakt">Napisz do nas</Link>.
            </p>
          </div>
        </div>
      </section>

      <CTABand
        title="Sprawdź, jak wygląda hosting bez gwiazdek"
        text="Załóż konto w kilka minut, a przeniesienie strony zostaw nam."
        primaryHref={ZAMOW}
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
    </main>
  );
}

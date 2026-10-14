import type { Metadata } from 'next';
import { Accordion, Card, CTABand, JsonLd, SectionHead, Steps, SubHero } from '../components/ui';
import { PANEL } from '@/lib/site';
import { faqSchema, webPageSchema } from '@/lib/schema';
import { POLECENIA } from '@/lib/polecenia';

const { prowizjaPct, karencjaDni, minWyplataZl, bonusKredyty, bonusCoPolecen } = POLECENIA;

const OPIS = `Poleć Verris i dostawaj ${prowizjaPct}% od każdej płatności poleconego klienta, bez limitu czasu. Zasady i stan prowizji w panelu klienta.`;

export const metadata: Metadata = {
  title: 'Program poleceń Verris — prowizja za polecenie hostingu',
  description: OPIS,
  alternates: { canonical: '/polecaj' },
};

/** Kwota w złotych z przecinkiem dziesiętnym (44,90 zł). */
const zl = (n: number) => `${n.toFixed(2).replace('.', ',')} zł`;

// Przykład z makiety: 5 firm po 449 zł/rok brutto (cena z cennika, ta sama przy odnowieniu).
const ROK = 449;
const FIRM = 5;
const PROWIZJA_ROK = (ROK * prowizjaPct) / 100;

const ZASADY: [string, string][] = [
  ['Prowizja', `${prowizjaPct}% od każdej płatności poleconego klienta za usługi`],
  ['Jak długo', 'przez cały czas, gdy polecony klient korzysta z usług'],
  ['Podstawa', 'płatności opłacone wpłatami poleconego klienta, po odliczeniu zwrotów'],
  ['Karencja', `${karencjaDni} dni od płatności (chroni przed zwrotami)`],
  ['Wypłata w Kredytach', 'od dowolnej kwoty, na Twój portfel (1 Kredyt = 1 zł)'],
  ['Wypłata przelewem', `od ${minWyplataZl} zł, na wskazany rachunek`],
  ['Bonus', `${bonusKredyty} Kredytów za każde ${bonusCoPolecen} płacących poleceń`],
];

const KROKI = [
  {
    label: '01',
    title: 'Dołącz w panelu',
    text: 'Zgłoszenie do programu wysyłasz w panelu klienta. Po zatwierdzeniu dostajesz osobisty link.',
  },
  { label: '02', title: 'Wyślij link dalej', text: 'Znajomemu, klientowi albo na blogu. Gdzie chcesz.' },
  {
    label: '03',
    title: 'Znajomy zakłada konto',
    text: 'Konto założone z Twojego linku zapisuje się w panelu jako Twoje polecenie.',
  },
  {
    label: '04',
    title: `Dostajesz ${prowizjaPct}%`,
    text: `Od każdej płatności poleconego klienta. Po ${karencjaDni} dniach prowizja jest do Twojej dyspozycji.`,
  },
];

const POWODY: [string, string][] = [
  ['Nie wstydzisz się odnowienia', 'Znajomy za rok zapłaci tyle samo — odnowienie idzie po cenie z cennika.'],
  ['Przeprowadzkę robimy my', 'Przeniesienie strony, baz i poczty jest w cenie. Nie musisz nikomu pomagać.'],
  ['Pomoc po polsku', 'Odpowiada człowiek, który zna się na rzeczy, a nie formułka.'],
];

const FAQ: [string, string][] = [
  [
    'Kto może polecać?',
    'Każdy klient Verris. Do programu zapisujesz się w panelu klienta, a my zatwierdzamy zgłoszenie. Link polecający pojawia się w panelu po zatwierdzeniu.',
  ],
  [
    'Ile wynosi prowizja?',
    `${prowizjaPct}% od każdej płatności poleconego klienta za usługi, przez cały czas, gdy z nami jest. Do tego ${bonusKredyty} Kredytów za każde ${bonusCoPolecen} płacących poleceń.`,
  ],
  [
    'Kiedy dostanę prowizję?',
    `${karencjaDni} dni po płatności poleconego klienta. Wtedy przenosisz ją na portfel Kredytów (od dowolnej kwoty) albo zlecasz przelew (od ${minWyplataZl} zł).`,
  ],
  [
    'Od czego liczona jest prowizja?',
    'Od płatności za usługi opłaconych wpłatami poleconego klienta. Część pokryta kredytem promocyjnym i kwoty zwrócone klientowi nie są podstawą prowizji.',
  ],
  [
    'Gdzie sprawdzę swoje polecenia i prowizje?',
    'W panelu klienta, w zakładce programu poleceń: liczba poleceń, prowizje w karencji, do wypłaty i wypłacone. Tam też widzisz aktualne warunki programu.',
  ],
];

export default function Page() {
  return (
    <main>
      <JsonLd data={webPageSchema({ name: 'Program poleceń Verris', description: OPIS, path: '/polecaj' })} />
      <JsonLd data={faqSchema(FAQ)} />

      <SubHero
        eyebrow="Program poleceń"
        title="Poleć Verris znajomym. Zarabiasz, kiedy oni są zadowoleni"
        lead={`Znasz kogoś, kogo co roku denerwuje faktura za hosting? Wyślij mu swój link. Dostajesz ${prowizjaPct}% od każdej jego płatności — tak długo, jak z nami zostaje.`}
        crumbs={[{ label: 'Program poleceń' }]}
        primary={{ label: 'Odbierz swój link', href: PANEL }}
        secondary={{ label: 'Zasady programu', href: '#zasady' }}
      />

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Krok po kroku" title="Jak działa program poleceń" />
          <Steps items={KROKI} variant="lista" />
        </div>
      </section>

      <section className="sec sec-alt" id="zasady">
        <div className="wrap">
          <SectionHead
            eyebrow="Zasady"
            title="Ile możesz zarobić na poleceniach"
            lead="Aktualne warunki programu widzisz też w panelu klienta, w zakładce programu poleceń."
          />
          <div className="d-zasady">
            <Card className="d-tabela">
              <table className="spec">
                <caption>Zasady programu poleceń</caption>
                <thead>
                  <tr>
                    <th scope="col">Zasada</th>
                    <th scope="col">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {ZASADY.map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card accent className="rates">
              <h3>Przykład</h3>
              <p>
                Polecasz Verris {FIRM} firmom, każda płaci {ROK} zł brutto za rok hostingu.
              </p>
              <dl>
                <div>
                  <dt>Prowizje</dt>
                  <dd>
                    {FIRM} × {zl(PROWIZJA_ROK)} = {zl(FIRM * PROWIZJA_ROK)}
                  </dd>
                </div>
                <div>
                  <dt>Bonus za {bonusCoPolecen} poleceń</dt>
                  <dd>{bonusKredyty} Kredytów</dd>
                </div>
                <div>
                  <dt>Razem w pierwszym roku</dt>
                  <dd>{zl(FIRM * PROWIZJA_ROK + bonusKredyty)}</dd>
                </div>
              </dl>
              <p>
                Prowizje wracają co roku, dopóki polecone firmy są z nami. Bonus dostajesz raz za każde kolejne{' '}
                {bonusCoPolecen} płacących poleceń.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Bez wstydu" title="Dlaczego łatwo nas polecić" />
          <div className="grid3">
            {POWODY.map(([t, p]) => (
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
          <SectionHead eyebrow="Pytania" title="Pytania o program poleceń" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Masz kogoś na myśli?"
        text="Odbierz link w panelu i wyślij go jeszcze dziś."
        primaryLabel="Odbierz swój link"
        primaryHref={PANEL}
        conv={null}
        secondary={{ label: 'Program dla agencji', href: '/reseller' }}
      />
    </main>
  );
}

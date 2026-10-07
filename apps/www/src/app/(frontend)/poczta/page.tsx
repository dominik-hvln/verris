import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, SectionHead, StickyBuy } from '../components/ui';
import { PANEL } from '@/lib/site';
import { EMAIL_MARKETING_W_SPRZEDAZY } from '@/lib/oferta';

export const metadata: Metadata = {
  title: 'Poczta e-mail w hostingu — skrzynki na własnej domenie | Verris',
  description:
    'Skrzynki e-mail na własnej domenie w ramach hostingu Verris. Webmail Roundcube, konfiguracja w panelu Verris, bez limitu liczby skrzynek w ramach zasobów konta. Migracja poczty w cenie.',
  alternates: { canonical: '/poczta' },
};

const ZYSKI: [string, string][] = [
  ['Skrzynki na własnej domenie', 'Bez limitu liczby w ramach zasobów konta.'],
  ['Webmail i klient poczty', 'Webmail Roundcube pod webmail.verris.pl oraz obsługa IMAP/SMTP w kliencie.'],
  ['Wszystko w panelu', 'Konfiguracja i zarządzanie kontami z panelu Verris.'],
  ['Migracja poczty w cenie', 'Przenosimy pocztę razem ze stroną — bez przestoju.'],
];

export default function Page() {
  const FAQ: [string, React.ReactNode][] = [
    ['Czy poczta to osobna usługa?', 'Nie. Konta pocztowe są w ramach hostingu, a migracja poczty razem ze stroną jest w cenie.'],
    ['Gdzie otworzę pocztę w przeglądarce?', 'W webmailu Roundcube pod webmail.verris.pl. Skrzynki skonfigurujesz też w kliencie poczty przez IMAP/SMTP.'],
    [
      'Jak przenieść pocztę z obecnego hostingu?',
      <>
        Przeprowadzkę skrzynek bierzemy na siebie, razem z migracją strony — bez utraty wiadomości. Szczegóły:{' '}
        <Link href="/przenies-strone">jak działa migracja</Link>.
      </>,
    ],
  ];
  if (EMAIL_MARKETING_W_SPRZEDAZY) {
    FAQ.push([
      'Czy mogę wysyłać kampanie do własnej listy?',
      <>
        To osobna usługa — <Link href="/email-marketing">e-mail marketing</Link>.
      </>,
    ]);
  }
  return (
    <main>
      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'Poczta' }]} />
            <h1>Firmowa poczta na własnej domenie</h1>
            <p className="lead">
              Profesjonalny adres @twojafirma.pl zamiast darmowej skrzynki. Konta pocztowe w ramach hostingu, webmail
              Roundcube i konfiguracja w kilku klikach.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero" conv="checkout_intent" plan="poczta">
                Załóż konto
              </Button>
              <Button href="/hosting" variant="ghost" cta="subhero-alt">
                Zobacz hosting
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">Poczta w abonamencie</h2>
            <dl>
              <div>
                <dt>Skrzynki</dt>
                <dd>bez limitu liczby</dd>
              </div>
              <div>
                <dt>Webmail</dt>
                <dd>Roundcube</dd>
              </div>
              <div>
                <dt>Klient poczty</dt>
                <dd>IMAP/SMTP</dd>
              </div>
              <div>
                <dt>Migracja poczty</dt>
                <dd>w cenie</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Poczta w ramach hostingu" title="Co dostajesz" />
          <div className="duo">
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
          <SectionHead eyebrow="Pytania" title="Częste pytania o pocztę" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Przenieś stronę i pocztę razem"
        text="Przeprowadzkę skrzynek bierzemy na siebie — bez utraty wiadomości."
        secondary={{ label: 'Jak działa migracja', href: '/przenies-strone' }}
      />
      <StickyBuy />
    </main>
  );
}

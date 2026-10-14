import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, StickyBuy } from '../components/ui';
import { EMAIL_MARKETING_W_SPRZEDAZY } from '@/lib/oferta';
import { faqSchema, graph, HOSTING_OFFERS, serviceSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';

/*
 * Makieta 14.10 (plansza Poczta). Funkcje sprawdzone w panelu klienta (zakładka Poczta, kreator SPF/DKIM/DMARC,
 * aliasy, autoodpowiedź, filtr antyspam, dzienny limit wysyłki). Z makiety pominięte, bo ich nie ma w kodzie:
 * konfiguracja telefonu kodem QR, sprawdzanie czarnych list, przeglądanie zatrzymanego spamu.
 */
export const metadata: Metadata = {
  title: 'Poczta w domenie — firmowy e-mail w hostingu | Verris',
  description:
    'Firmowa poczta na własnej domenie w hostingu za 45 zł/mies brutto: skrzynki bez limitu liczby, webmail, SPF, DKIM i DMARC w panelu, migracja w cenie.',
  alternates: { canonical: '/poczta' },
};

const FUNKCJE: [string, string][] = [
  ['Telefon i komputer', 'Skrzynkę dodasz do aplikacji pocztowej w telefonie albo na komputerze przez IMAP i SMTP.'],
  ['Poczta w przeglądarce', 'Webmail Roundcube pod webmail.verris.pl, gdy jesteś z dala od własnego komputera.'],
  ['Aliasy i przekierowania', 'kontakt@, faktury@ i sklep@ mogą trafiać do jednej skrzynki. Autoodpowiedź na urlop ustawisz w panelu.'],
  ['Mniej spamu', 'Filtr antyspamowy włączasz dla domeny w panelu i sam ustawiasz jego czułość.'],
];

const RAPORT: [string, string][] = [
  ['SPF', 'stan odczytany z publicznego DNS'],
  ['DKIM', 'podpis wysyłanych wiadomości'],
  ['DMARC', 'polityka do wyboru i gotowy rekord'],
  ['Brakujący rekord', 'jednym kliknięciem, gdy domena używa DNS Verris'],
];

export default function Page() {
  const FAQ: [string, string][] = [
    [
      'Jak założyć pocztę w swojej domenie?',
      'Zamawiasz hosting, dodajesz domenę i w panelu zakładasz skrzynkę w zakładce Poczta. Stan rekordów SPF, DKIM i DMARC sprawdzisz w tym samym panelu.',
    ],
    [
      'Ile skrzynek mogę mieć?',
      'Nie liczymy skrzynek. Granicą są zasoby konta — 50 GB miejsca NVMe w pakiecie, wspólne dla stron i poczty.',
    ],
    [
      'Czy przeniesiecie maile ze starej poczty?',
      'Tak, w cenie hostingu. Zakładamy skrzynki u nas i kopiujemy wiadomości z folderami — potrzebujemy tylko haseł przenoszonych skrzynek.',
    ],
    [
      'Dlaczego moje maile trafiają do spamu?',
      'Najczęściej z powodu brakujących rekordów SPF, DKIM albo DMARC. Panel pokazuje ich stan i podpowiada gotowy rekord; gdy domena używa DNS Verris, dodasz go jednym kliknięciem.',
    ],
    [
      'Gdzie otworzę pocztę w przeglądarce?',
      'W webmailu Roundcube pod webmail.verris.pl. Skrzynki skonfigurujesz też w aplikacji pocztowej przez IMAP i SMTP.',
    ],
    [
      'Czy mogę wysyłać newsletter z firmowej skrzynki?',
      EMAIL_MARKETING_W_SPRZEDAZY
        ? 'Zwykła skrzynka ma dzienny limit wysyłki, żeby chronić reputację serwera. Do newsletterów służy osobna usługa e-mail marketingu.'
        : 'Zwykła skrzynka ma dzienny limit wysyłki, żeby chronić reputację serwera — nie służy do masowych kampanii.',
    ],
  ];

  const jsonLd = graph(
    serviceSchema({
      name: 'Poczta e-mail w domenie',
      description:
        'Skrzynki e-mail na własnej domenie w ramach hostingu Verris: webmail Roundcube, IMAP/SMTP, aliasy, autoodpowiedź, filtr antyspam, SPF/DKIM/DMARC w panelu.',
      path: '/poczta',
      offers: HOSTING_OFFERS,
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
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'Poczta' }]} />
            <span className="eyebrow" style={{ marginTop: 18 }}>
              Poczta w domenie
            </span>
            <h1>
              Firmowy e-mail, <span className="mint">który trafia do skrzynki, nie do spamu</span>
            </h1>
            <p className="lead">
              biuro@twojafirma.pl wygląda poważniej niż adres z darmowej poczty. Skrzynki zakładasz w panelu, a stan
              rekordów, od których zależy dostarczalność, widzisz w jednym miejscu.
            </p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="subhero" conv="checkout_intent" plan="poczta">
                Załóż firmową pocztę
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="subhero-alt">
                Przenieś skrzynki z innego hostingu
              </Button>
            </div>
            <p className="hero2-fine">
              Poczta jest w pakiecie hostingu za <strong>45 zł/mies</strong> lub <strong>449 zł/rok</strong> brutto. Bez
              limitu liczby skrzynek, w ramach miejsca na koncie.
            </p>
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
                <dt>Aliasy i autoodpowiedź</dt>
                <dd>w panelu</dd>
              </div>
              <div>
                <dt>SPF · DKIM · DMARC</dt>
                <dd>stan w panelu</dd>
              </div>
              <div>
                <dt>Przeniesienie skrzynek</dt>
                <dd>w cenie</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="b-poczta-funkcje">
        <div className="wrap">
          <SectionHead id="b-poczta-funkcje" eyebrow="W pakiecie" title="Wszystko, czego potrzebuje poczta w małej firmie" />
          <div className="b-grid4">
            {FUNKCJE.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-spam">
        <div className="wrap b-split">
          <SectionHead
            id="b-spam"
            eyebrow="Dostarczalność"
            title="Dlaczego maile trafiają do spamu? I jak to naprawić"
            lead="Skrzynki odbiorców sprawdzają, czy wiadomość naprawdę wysłała Twoja firma. Bez poprawnych rekordów SPF, DKIM i DMARC nawet zwykła oferta może wylądować w spamie. Panel Verris pokazuje ich stan i podpowiada, co dodać."
          />
          <div className="b-ramka">
            <h3>Kreator SPF, DKIM i DMARC w panelu</h3>
            <ul className="b-pokaz-ekran" style={{ minHeight: 0, marginTop: 12 }}>
              {RAPORT.map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  <span className="b-pokaz-v">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="FAQ" title="Pytania o pocztę w domenie" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          {EMAIL_MARKETING_W_SPRZEDAZY && (
            <p className="b-przypis">
              Kampanie do własnej listy wyślesz przez <Link href="/email-marketing">e-mail marketing</Link>.
            </p>
          )}
        </div>
      </section>

      <CTABand
        title="Twoja firma pod własnym adresem. Skrzynki przeniesiemy za darmo"
        text="Skrzynki w Twojej domenie, webmail i kreator SPF, DKIM i DMARC od pierwszego dnia."
        primaryLabel="Załóż firmową pocztę"
        primaryHref={ZAMOW}
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <StickyBuy href={ZAMOW} />
    </main>
  );
}

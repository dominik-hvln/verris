import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, CTABand, JsonLd, SectionHead2 } from '../components/ui';
import { MobilnyPasek } from '../components/MobilnyPasek';
import { PasRozmowy } from '../components/PasRozmowy';
import { KartyUslug, Poradniki } from '../components/KartyUslug';
import { PocztaKonfiguracja } from '../components/PocztaKonfiguracja';
import { pobierzCeny } from '@/lib/ceny-api';
import { netto, zl, type Ceny } from '@/lib/ceny';
import { pasekPoczty, ZAMOW_POCZTE } from '@/lib/proba';
import { EMAIL_MARKETING_W_SPRZEDAZY } from '@/lib/oferta';
import { faqSchema, graph, serviceSchema } from '@/lib/schema';

/*
 * Makieta 1.11.2026 (plansza „/poczta — nowa”). Fakty sprawdzone w kodzie:
 *  - limity skrzynek i wysyłki: /specyfikacja (domyślnie 1 GB, do 100 GB, 1000 wiadomości na dobę z konta),
 *  - porty: artykuł bazy wiedzy „Konfiguracja poczty e-mail (IMAP/SMTP, porty)”,
 *  - dogranie różnic przed przełączeniem: delta-sync migratora (migration-orchestrator.service.ts, queueDeltaSync).
 * Celowo pominięte: rozmiar największej wiadomości (brak potwierdzonej wartości z serwera),
 * konfiguracja kodem QR i sprawdzanie czarnych list (nie ma ich w kodzie).
 * Ceny wyłącznie z lib/ceny (GET /plans) — bez kwot wpisanych na sztywno.
 */
export const metadata: Metadata = {
  title: 'Poczta w domenie — firmowy e-mail | Verris',
  description:
    'Firmowa poczta na własnej domenie: skrzynki bez limitu liczby, do 100 GB na skrzynkę, webmail, SPF, DKIM i DMARC w panelu, przeniesienie skrzynek w cenie.',
  alternates: { canonical: '/poczta' },
};

const LIMITY: { duzo: string; co: string; opis: string }[] = [
  { duzo: 'bez limitu', co: 'liczba skrzynek', opis: 'w ramach 50 GB miejsca konta, wspólnego dla stron i poczty' },
  { duzo: 'do 100 GB', co: 'na jedną skrzynkę', opis: 'domyślnie 1 GB, rozmiar zmieniasz w panelu' },
  { duzo: '1000', co: 'wiadomości na dobę', opis: 'wysyłka z konta; limit chroni reputację serwera' },
];

const DODATKI: [string, string][] = [
  ['Kopie poczty z 30 dni', 'Skasowane wiadomości przywrócisz sam, z wybranego dnia.'],
  ['Aliasy i przekierowania', 'kontakt@, faktury@ i sklep@ mogą trafiać do jednej skrzynki. Autoodpowiedź na urlop ustawisz w panelu.'],
  ['Kalendarz i kontakty', 'CalDAV i CardDAV dla każdej skrzynki, także na telefonie.'],
];

const PRZENIESIENIE: [string, string][] = [
  ['Zakładasz konto', 'Dodajesz domenę w panelu. Skrzynki o tych samych nazwach założymy za Ciebie.'],
  ['Podajesz hasła skrzynek', 'Tylko tych, które przenosimy. Szyfrujemy je i kasujemy po zakończeniu.'],
  ['Kopiujemy wiadomości', 'Z folderami, także Wysłane i Archiwum. Postęp widzisz przy każdej skrzynce.'],
  [
    'Przełączasz domenę',
    'Domena zostaje tam, gdzie jest. W panelu pokażemy, co przepisać w jej ustawieniach. Tuż przed przełączeniem jednym kliknięciem dogrywasz maile z ostatnich godzin.',
  ],
];

const RAPORT: { k: string; v: string; ok: boolean }[] = [
  { k: 'SPF', v: 'ustawiony', ok: true },
  { k: 'DKIM', v: 'ustawiony', ok: true },
  { k: 'DMARC', v: 'brak · Dodaj', ok: false },
];

const PARAMETRY: [string, string][] = [
  ['Liczba skrzynek i aliasów', 'bez limitu, w ramach 50 GB konta'],
  ['Pojemność skrzynki', 'domyślnie 1 GB, do 100 GB'],
  ['Wysyłka', 'do 1000 wiadomości na dobę z konta'],
  ['Dostęp', 'IMAP, POP3 i SMTP z szyfrowaniem, poczta w przeglądarce z logowaniem z panelu'],
  ['Funkcje', 'przekierowania, autoresponder, catch-all, filtr antyspamowy'],
  ['Uwierzytelnianie', 'SPF, DKIM, DMARC z kreatorem w panelu'],
  ['Kalendarz i kontakty', 'CalDAV i CardDAV'],
  ['Kopie', 'codziennie, przywracanie z każdego z ostatnich 30 dni'],
  ['Newslettery', 'nie ze zwykłej skrzynki; zwykła skrzynka ma dzienny limit wysyłki'],
];

const WEBMAIL: { t: string; od: string; nowa: boolean }[] = [
  { t: 'Zamówienie #1042 — opłacone', od: 'sklep@pracownia-anna.pl · 10:24', nowa: true },
  { t: 'Pytanie o termin dostawy', od: 'Marek W. · 9:51', nowa: true },
  { t: 'Faktura za październik', od: 'biuro rachunkowe · wczoraj', nowa: true },
  { t: 'Oferta współpracy', od: 'Piotr K. · wt.', nowa: false },
];

/** Oferty schema.org z planu „sama poczta” (ceny brutto z API). */
function oferty(ceny: Ceny) {
  return [
    { '@type': 'Offer', price: ceny.poczta.miesiecznie.toFixed(2), priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Sama poczta, rozliczenie miesięczne, cena brutto' },
    { '@type': 'Offer', price: ceny.poczta.rocznie.toFixed(2), priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Sama poczta, rozliczenie roczne, cena brutto' },
  ];
}

export default async function Page() {
  const ceny = await pobierzCeny();
  const p = ceny.poczta;
  const FAQ: [string, string][] = [
    [
      'Ile kosztuje firmowa poczta bez hostingu strony?',
      `${zl(p.miesiecznie)} miesięcznie albo ${zl(p.rocznie)} za rok brutto (${zl(netto(p.miesiecznie))} albo ${zl(netto(p.rocznie))} netto). Jeśli masz hosting w Verris, poczta jest w nim w cenie.`,
    ],
    [
      'Jak założyć pocztę w swojej domenie?',
      'Zamawiasz pocztę, podajesz swoją domenę i w panelu zakładasz skrzynkę w zakładce Poczta. Stan rekordów SPF, DKIM i DMARC sprawdzisz w tym samym panelu.',
    ],
    [
      'Moja domena jest w innej firmie. Co mam z nią zrobić?',
      'Nic nie musisz przenosić. Domena może zostać tam, gdzie jest teraz. Po zakupie pokażemy w panelu, co dokładnie przepisać w ustawieniach domeny u tej firmy, żeby poczta zaczęła działać. To zajmuje kilka minut. Jeśli wolisz zrobić to z nami, poproś o telefon niżej na tej stronie.',
    ],
    [
      'Ile skrzynek mogę mieć?',
      'Nie liczymy skrzynek. Granicą są zasoby konta — 50 GB miejsca NVMe w pakiecie, wspólne dla stron i poczty. Jedna skrzynka może mieć do 100 GB.',
    ],
    [
      'Czy przeniesiecie maile ze starej poczty?',
      'Tak, w cenie. Zakładamy skrzynki u nas i kopiujemy wiadomości z folderami — potrzebujemy tylko haseł przenoszonych skrzynek.',
    ],
    [
      'Dlaczego moje maile trafiają do spamu?',
      'Najczęściej z powodu brakujących rekordów SPF, DKIM albo DMARC. Panel pokazuje ich stan i podpowiada gotowy rekord; gdy domena używa DNS Verris, dodasz go jednym kliknięciem.',
    ],
    [
      'Gdzie otworzę pocztę w przeglądarce?',
      'Pod webmail.verris.pl albo jednym kliknięciem z panelu, bez osobnego logowania. Skrzynki skonfigurujesz też w aplikacji pocztowej przez IMAP i SMTP.',
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
        'Skrzynki e-mail na własnej domenie: poczta w przeglądarce, IMAP/SMTP, aliasy, autoodpowiedź, filtr antyspam, SPF/DKIM/DMARC w panelu.',
      path: '/poczta',
      offers: oferty(ceny),
    }),
    faqSchema(FAQ),
  );

  // P4-4: na /poczta przyciski zamawiają pocztę (rejestracja z celem „Poczta e-mail”), nie hosting.
  const glowny = { label: 'Załóż firmową pocztę', href: ZAMOW_POCZTE };

  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap pcz-hero">
          <div className="pcz-hero-t">
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'Poczta' }]} />
            <span className="eyebrow" style={{ marginTop: 18 }}>
              Poczta w domenie
            </span>
            <h1>
              Firmowy e-mail, <span className="mint">który trafia do skrzynki, nie do spamu</span>
            </h1>
            <p className="lead">
              anna@twojafirma.pl na telefonie, w Outlooku i w przeglądarce. Skrzynek nie liczymy, a SPF, DKIM i DMARC
              ustawisz w panelu w minutę.
            </p>
            <div className="hero2-cta">
              <Button href={glowny.href} cta="subhero" conv="checkout_intent" plan="poczta">
                {glowny.label}
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="subhero-alt">
                Przenieś pocztę za 0 zł
              </Button>
            </div>
            <p className="hero2-fine">
              Sama poczta, bez hostingu strony: <strong>{zl(p.miesiecznie)}/mies.</strong> brutto ({zl(netto(p.miesiecznie))} netto)
              albo <strong>{zl(p.rocznie)}/rok</strong> brutto ({zl(netto(p.rocznie))} netto). Masz już hosting w Verris? Poczta
              jest w nim w cenie.
            </p>
          </div>

          <figure className="pcz-webmail" aria-label="Ekran poglądowy poczty w przeglądarce">
            <div className="pcz-wm-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="mono">poczta Verris · anna@pracownia-anna.pl</span>
            </div>
            <div className="pcz-wm-body" aria-hidden="true">
              <ul className="pcz-wm-foldery">
                <li className="on">
                  Odebrane <b>3</b>
                </li>
                <li>Wysłane</li>
                <li>Faktury</li>
                <li>Sklep</li>
                <li>Spam</li>
              </ul>
              <ul className="pcz-wm-lista">
                {WEBMAIL.map((m) => (
                  <li key={m.t} className={m.nowa ? 'nowa' : undefined}>
                    <span className="t">{m.t}</span>
                    <span className="od">{m.od}</span>
                  </li>
                ))}
              </ul>
            </div>
            <figcaption>Ekran poglądowy, przykładowe dane.</figcaption>
          </figure>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="pcz-limity">
        <div className="wrap">
          <SectionHead2
            id="pcz-limity"
            eyebrow="Limity"
            title="Ile skrzynek, ile miejsca, ile maili"
            lead="Liczby, o które pytają klienci, zanim przeniosą pocztę."
          />
          <ul className="pcz-limity">
            {LIMITY.map((l) => (
              <li key={l.co} className="card">
                <span className="pcz-duzo">{l.duzo}</span>
                <strong>{l.co}</strong>
                <span>{l.opis}</span>
              </li>
            ))}
          </ul>
          <ul className="pcz-dodatki">
            {DODATKI.map(([t, d]) => (
              <li key={t} className="card">
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" aria-labelledby="pcz-konf">
        <div className="wrap">
          <SectionHead2
            id="pcz-konf"
            eyebrow="Telefon i komputer"
            title="Skonfigurujesz w 2 minuty"
            lead="Wybierz urządzenie. Adres serwera znajdziesz w panelu przy każdej skrzynce, z przyciskiem „Kopiuj”."
          />
          <PocztaKonfiguracja />
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="pcz-przen">
        <div className="wrap">
          <SectionHead2
            id="pcz-przen"
            eyebrow="Przeniesienie poczty · 0 zł"
            title="Przenosimy skrzynki razem z folderami"
            lead="Stara poczta działa, dopóki nie przełączysz domeny. Żaden mail nie ginie po drodze."
          />
          <ol className="pcz-kroki4">
            {PRZENIESIENIE.map(([t, d], i) => (
              <li key={t} className={`card${i === PRZENIESIENIE.length - 1 ? ' card-accent' : ''}`}>
                <span className="mono pcz-nr">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec" aria-labelledby="pcz-spam" id="dostarczalnosc">
        <div className="wrap pcz-spam">
          <div>
            <p className="kicker">Dostarczalność</p>
            <h2 id="pcz-spam">Dlaczego maile trafiają do spamu i jak to naprawić</h2>
            <p className="lead">
              Skrzynki odbiorców sprawdzają, czy serwer może wysyłać w imieniu Twojej domeny. Bez trzech rekordów DNS Twoje
              oferty lądują w spamie. W panelu widzisz, co jest ustawione, a brakujące dodasz jednym kliknięciem, gdy domena
              używa DNS Verris.
            </p>
          </div>
          <figure className="card pcz-raport" aria-label="Ekran poglądowy kreatora SPF, DKIM i DMARC">
            <strong>twojafirma.pl · uwierzytelnianie poczty</strong>
            <ul>
              {RAPORT.map((r) => (
                <li key={r.k}>
                  <span>{r.k}</span>
                  <span className={r.ok ? 'ok' : 'brak'}>{r.ok ? `✓ ${r.v}` : r.v}</span>
                </li>
              ))}
            </ul>
            <figcaption>Ekran poglądowy kreatora w panelu.</figcaption>
          </figure>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="pcz-param">
        <div className="wrap">
          <SectionHead2
            id="pcz-param"
            eyebrow="Parametry"
            title="Poczta w liczbach"
            lead={
              <>
                Pełna lista, ta sama co w <Link href="/specyfikacja">specyfikacji hostingu</Link>.
              </>
            }
          />
          <div className="card pcz-param">
            <table>
              <caption className="pcz-sr">Parametry poczty</caption>
              <tbody>
                {PARAMETRY.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead2 eyebrow="FAQ" title="Pytania o pocztę w domenie" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          {EMAIL_MARKETING_W_SPRZEDAZY && (
            <p className="b-przypis">
              Kampanie do własnej listy wyślesz przez <Link href="/email-marketing">e-mail marketing</Link>.
            </p>
          )}
        </div>
      </section>

      <section className="sec sec-alt" aria-label="Inne usługi i poradniki">
        <div className="wrap pcz-powiazane">
          <KartyUslug pomin={['poczta']} />
          <Poradniki />
        </div>
      </section>

      <PasRozmowy temat="poczta" />

      <CTABand
        title="Twoja firma pod własnym adresem. Skrzynki przeniesiemy za darmo"
        text="Skrzynki w Twojej domenie, poczta w przeglądarce i kreator SPF, DKIM i DMARC od pierwszego dnia."
        primaryLabel={glowny.label}
        primaryHref={glowny.href}
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <MobilnyPasek {...pasekPoczty(ceny)} />
    </main>
  );
}

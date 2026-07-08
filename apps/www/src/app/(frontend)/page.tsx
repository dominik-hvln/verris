import {
  Server,
  Terminal,
  Globe,
  Mail,
  Users,
  Move,
  ArrowLeftRight,
  ShieldCheck,
  MapPin,
  FileText,
  BarChart3,
  RefreshCw,
  Database,
} from 'lucide-react';
import { Pricing } from './components/Pricing';
import { RevealInit } from './components/RevealInit';
import { JsonLd } from './components/ui';
import { organization, ORG_ID, SITE, HOSTING_OFFERS } from '@/lib/schema';

const SERVICES = [
  {
    icon: Server,
    title: 'Hosting z autoskalowaniem',
    desc: 'Strony, sklepy i poczta na DirectAdmin. Zasoby rosną automatycznie w piku i zwalniają w trybie ECO — nie kupujesz pakietu „na zapas".',
    tag: '39 zł/mies · 349 zł/rok brutto',
    tagClass: 'price',
    cta: 'Zobacz cennik →',
    href: '#cennik',
    feature: true,
  },
  {
    icon: Terminal,
    title: 'VPS',
    desc: 'Serwery niezarządzane z pełnym dostępem root. Przewidywalne zasoby i pełna kontrola — dla deweloperów i startupów.',
    tag: 'Konfiguracja i wycena w panelu',
    tagClass: 'note',
    cta: 'Sprawdź VPS →',
    href: 'https://panel.verris.pl',
  },
  {
    icon: Globe,
    title: 'Domeny',
    desc: 'Rejestracja, transfer i utrzymanie. Bez cichego auto-odnowienia — przypomnimy 30, 14 i 7 dni przed wygaśnięciem, a Ty decydujesz.',
    tag: 'Dostępność i ceny sprawdzisz w panelu',
    tagClass: 'note',
    cta: 'Wyszukaj domenę →',
    href: 'https://panel.verris.pl',
  },
  {
    icon: Mail,
    title: 'E-mail marketing',
    desc: 'Wysyłki do własnych list odbiorców — prosto z panelu. Ty zarządzasz zgodami swoich odbiorców, my dajemy narzędzie i dostarczalność.',
    tag: 'Dostępne w panelu klienta',
    tagClass: 'note',
    cta: 'Dowiedz się więcej →',
    href: 'https://panel.verris.pl',
  },
  {
    icon: Users,
    title: 'Program resellerski',
    desc: 'Odsprzedawaj usługi pod własną marką agencji. Wielu klientów z jednego panelu — mniej klikania, większa marża.',
    tag: 'Dla agencji i freelancerów',
    tagClass: 'note',
    cta: 'Zostań resellerem →',
    href: 'https://panel.verris.pl',
  },
  {
    icon: Move,
    title: 'Przenosisz się z innego hostingu?',
    desc: 'Przeprowadzkę strony i poczty wykonuje nasz zespół — albo migrator w panelu. Bez przestoju, bez limitu plików, za 0 zł.',
    tag: 'Migracja: 0 zł',
    tagClass: 'price',
    cta: 'Przenieś stronę za darmo →',
    href: 'https://verris.pl/przenies-strone',
  },
];

const USP = [
  { icon: ShieldCheck, title: 'SLA 99,5% z rekompensatami', desc: 'Nie „obiecujemy" — gwarantujemy w umowie. Za niedostępność naliczamy kredyty wg regulaminu.' },
  { icon: MapPin, title: 'Infrastruktura w UE', desc: 'Serwery Hetzner (Niemcy/Finlandia). Dane pozostają w EOG — prościej o zgodność z RODO.' },
  { icon: FileText, title: 'Komplet RODO online', desc: 'Polityka prywatności, DPA do akceptacji w panelu i lista podprocesorów — godziny mniej papierologii.' },
  { icon: BarChart3, title: 'Analityka bez cookies', desc: 'Statystyki odwiedzin bez danych osobowych i bez banera zgód. Konkurencja każe wpinać GA.' },
  { icon: RefreshCw, title: 'Domeny bez pułapek', desc: 'Brak cichych auto-odnowień z karty. Przypominamy przed wygaśnięciem, a decyzję zostawiamy Tobie.' },
  { icon: Database, title: 'Kopie z samodzielnym odtwarzaniem', desc: 'Backup i przywracanie z poziomu DirectAdmin — bez czekania na support i bez dopłat.' },
];

const COMPARE: [string, string, string][] = [
  ['Cena po pierwszym okresie', 'Tania przynęta, drogie odnowienie', 'Jedna cena z cennika od pierwszego dnia'],
  ['Model zasobów', 'Sztywny pakiet — płacisz za moc „na zapas"', 'Autoskalowanie — płacisz za realne użycie'],
  ['Migracja strony i poczty', 'Często płatna lub „zrób to sam"', 'Zespół albo migrator w panelu — 0 zł'],
  ['Certyfikat SSL', 'Bywa dopłatą przy odnowieniu', "Let's Encrypt w cenie"],
  ['Statystyki odwiedzin', 'Wtyczka GA + baner zgód', 'Prywatna analityka bez cookies'],
  ['Odnowienie domeny', 'Ciche auto-odnowienie z karty', 'Przypomnienia 30/14/7 dni — decydujesz Ty'],
  ['Dostępność (SLA)', 'Zwykle bez rekompensat', 'SLA 99,5% z rekompensatami w regulaminie'],
];

const FAQ: [string, string][] = [
  ['Czym hosting Verris różni się od zwykłego pakietu?', 'Zamiast sztywnego pakietu, który przez większość roku się nudzi, dostajesz bazowe zasoby (50 GB NVMe, 8 GB RAM, 2 vCPU) i autoskalowanie. W piku ruchu moc rośnie automatycznie — do 24 vCPU, 64 GB RAM i 1000 GB — i rozliczana jest godzinowo. Gdy ruch spada, tryb ECO zwalnia zasoby i naliczanie się kończy. Nie kupujesz mocy na zapas.'],
  ['Czy mogę przenieść stronę z innego hostingu?', 'Tak. Przeprowadzkę strony i poczty wykonuje zespół Verris albo migrator w panelu — oba bezpłatne w ramach zamówienia hostingu. Migracja odbywa się obok działającej strony, bez przestoju, a przełączenie następuje przez zmianę DNS. Bez limitu liczby plików i bez dopłat za bazy danych.'],
  ['Ile kosztuje autoskalowanie?', 'Bazowe zasoby są w cenie pakietu (39 zł/mies lub 349 zł/rok brutto). Nadwyżkę ponad bazę rozliczamy godzinowo — płacisz tylko za czas faktycznego użycia. Orientacyjny koszt policzysz w kalkulatorze autoskalowania.'],
  ['Co znaczy „bez limitu" stron, skrzynek i transferu?', 'Nie nakładamy sztywnego licznika na liczbę stron, skrzynek e-mail ani na transfer. Realnym ogranicznikiem są zasoby konta (CPU, RAM, dysk) oraz zasady uczciwego korzystania — dzięki autoskalowaniu te zasoby możesz zwiększać na żądanie.'],
  ['Jak płacę i czy dostanę fakturę?', 'Kartą, BLIK-iem, Apple Pay, Google Pay, przelewem online (Stripe) lub Kredytami Verris. Faktury VAT znajdziesz w panelu i w e-mailu, gotowe na KSeF.'],
  ['Gdzie stoją serwery Verris?', 'W centrach danych w Unii Europejskiej (Hetzner, Niemcy/Finlandia). Dane pozostają w EOG, co upraszcza zgodność z RODO.'],
  ['Czy cena wzrośnie przy odnowieniu?', 'Nie stosujemy modelu taniego pierwszego roku i drogiego odnowienia — cena z cennika obowiązuje od pierwszego dnia. Odnowienie następuje według cennika z dnia odnowienia, a przed każdym odnowieniem wyślemy przypomnienie e-mail. Odnawianie wyłączysz w panelu w każdej chwili, bez opłat.'],
];

const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Verris', inLanguage: 'pl-PL', publisher: { '@id': ORG_ID } },
    {
      '@type': 'Product',
      name: 'Hosting Verris z autoskalowaniem',
      description:
        'Hosting współdzielony na DirectAdmin z autoskalowaniem CPU/RAM/dysku i trybem ECO. Baza: 50 GB NVMe, 8 GB RAM, 2 vCPU; skalowanie do 1000 GB, 64 GB RAM, 24 vCPU. Migracja i SSL za 0 zł, SLA 99,5% z rekompensatami.',
      brand: { '@id': ORG_ID },
      offers: HOSTING_OFFERS,
    },
    { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ],
};

export default function HomePage() {
  return (
    <main>
      <JsonLd data={homeJsonLd} />
      {/* HERO */}
      <section className="hero">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="hero-inner">
            <span className="eyebrow">Polski hosting z autoskalowaniem</span>
            <h1>
              Hosting <span className="accent">bez gwiazdek.</span>
              <br />
              Płacisz tyle, ile widzisz.
            </h1>
            <p className="lead">
              Hosting współdzielony z autoskalowaniem, VPS i domeny — w jednym panelu i pod opieką
              polskiego zespołu. Bez taniej przynęty na pierwszy rok i bez szoku przy odnowieniu.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="https://panel.verris.pl" data-event="cta_click" data-cta="hero" data-conv="begin_checkout">
                Załóż konto
              </a>
              <a className="btn btn-ghost" href="https://verris.pl/przenies-strone" data-event="cta_click" data-cta="hero-migracja">
                Przenieś stronę za darmo
              </a>
            </div>
            <form className="dsearch" action="https://panel.verris.pl" method="get" role="search" aria-label="Wyszukiwarka domen">
              <input type="text" name="domain" placeholder="Znajdź domenę dla swojej strony…" aria-label="Nazwa domeny" />
              <button className="btn btn-primary" type="submit" data-event="cta_click" data-cta="domain-search" data-conv="generate_lead" data-method="domain_search">
                Sprawdź
              </button>
            </form>
            <p className="hero-fine">
              Hosting z autoskalowaniem: <strong>39 zł/mies</strong> lub <strong>349 zł/rok</strong>{' '}
              brutto · SSL i migracja gratis
            </p>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <div className="trust">
        <div className="wrap">
          <div className="row">
            <span><ShieldCheck /> SLA 99,5% z rekompensatami</span>
            <span><Globe /> Serwery w UE</span>
            <span><ArrowLeftRight /> Migracja 0 zł</span>
            <span><BarChart3 /> Analityka bez cookies</span>
            <span><FileText /> Komplet RODO online</span>
          </div>
        </div>
      </div>

      {/* USŁUGI */}
      <section id="uslugi">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Usługi</p>
            <h2>Wszystko, czego potrzebuje Twoja obecność w sieci</h2>
            <p>Jeden panel, jedne faktury, jeden polski zespół. Zaczynasz od hostingu, dokładasz resztę, gdy urośniesz.</p>
          </div>
          <div className="svc-grid">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <article className={`svc rv${s.feature ? ' feature' : ''}`} key={s.title}>
                  <div className="svc-ico"><Icon /></div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <p className={`p-tag ${s.tagClass}`}>{s.tag}</p>
                  <a className="go" href={s.href}>{s.cta}</a>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* AUTOSKALOWANIE */}
      <section className="band" id="autoskalowanie">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Autoskalowanie</p>
            <h2>Moc rośnie z ruchem. Rachunek — tylko za realne użycie.</h2>
            <p>Koniec z pakietem dobieranym „na zapas". Bazę masz w cenie, a nadwyżkę płacisz godzinowo — sekundę po piku naliczanie się kończy.</p>
          </div>
          <div className="steps">
            <div className="step rv"><span className="n">01</span><h3>Baza w cenie</h3><p>50 GB NVMe, 8 GB RAM i 2 vCPU działają non-stop w ramach abonamentu 39 zł/mies. Dla większości stron to z zapasem wystarczy.</p></div>
            <div className="step rv"><span className="n">02</span><h3>Pik ruchu → scale-up</h3><p>Kampania, Black Friday, wejście na home w mediach? Zasoby rosną automatycznie — do 24 vCPU, 64 GB RAM i 1000 GB — rozliczane co godzinę.</p></div>
            <div className="step rv"><span className="n">03</span><h3>Spadek → tryb ECO</h3><p>Gdy ruch opada, tryb ECO zwalnia nadwyżkę i naliczanie się kończy. Nie płacisz za moc, której strona nie używa.</p></div>
          </div>
          <div className="scale-stats rv">
            <div className="sstat"><div className="v">2 → 24 vCPU</div><div className="l">wydajność do 24× w piku</div></div>
            <div className="sstat"><div className="v">8 → 64 GB</div><div className="l">RAM na żądanie</div></div>
            <div className="sstat"><div className="v">50 → 1000 GB</div><div className="l">dysk NVMe</div></div>
          </div>
          <div className="center-cta" style={{ textAlign: 'center', marginTop: 36 }}>
            <a className="btn btn-ghost" href="https://verris.pl/przenies-strone#kalkulator" data-event="cta_click" data-cta="calc">
              Policz koszt w kalkulatorze →
            </a>
          </div>
        </div>
      </section>

      {/* CENNIK */}
      <Pricing />

      {/* PORÓWNANIE */}
      <section className="band">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Dlaczego Verris</p>
            <h2>Konkrety zamiast gwiazdek w cenniku</h2>
            <p>Każdy punkt po stronie Verris ma pokrycie w regulaminie albo w specyfikacji usługi.</p>
          </div>
          <table className="cmp rv">
            <thead>
              <tr><th>Na co patrzysz</th><th>Typowy hosting</th><th>Verris</th></tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r[0]}>
                  <th>{r[0]}</th>
                  <td className="other">{r[1]}</td>
                  <td className="vr">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* USP */}
      <section>
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Spokój w cenie</p>
            <h2>Zbudowane wokół zaufania, nie obietnic</h2>
          </div>
          <div className="usp-grid">
            {USP.map((u) => {
              const Icon = u.icon;
              return (
                <div className="usp rv" key={u.title}>
                  <h3><Icon /> {u.title}</h3>
                  <p>{u.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="band" id="faq">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">FAQ</p>
            <h2>Częste pytania</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details className="rv" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="final-inner rv">
            <h2>Twoja strona zasługuje na hosting bez pułapek.</h2>
            <p>Załóż konto, przekaż dostępy — resztą przeprowadzki zajmiemy się my. Za 0 zł.</p>
            <a className="btn btn-primary" href="https://panel.verris.pl" data-event="cta_click" data-cta="final" data-conv="begin_checkout">
              Zacznij z Verris
            </a>
          </div>
        </div>
      </section>

      <RevealInit />
    </main>
  );
}

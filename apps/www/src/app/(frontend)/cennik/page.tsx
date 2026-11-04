import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Card, CTABand, JsonLd, SectionHead, SubHero } from '../components/ui';
import { MobilnyPasek } from '../components/MobilnyPasek';
import { pobierzCeny } from '@/lib/ceny-api';
import { cenaPakietu, miesiecznieZRocznej, netto, odCeny, RABAT_NA_START, zl, type CenaPakietu } from '@/lib/ceny';
import { pasekHostingu } from '@/lib/proba';
import { Pricing } from '../components/Pricing';
import { AKalkulator } from '../components/AKalkulator';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';
import { faqSchema, ofertyHostingu, productSchema } from '@/lib/schema';

// Makieta 14.10, plansza Cennik. Ceny i stawki z API (lib/ceny-api); w metadanych bez kwot, bo te są statyczne.
export const metadata: Metadata = {
  title: 'Cennik hostingu — cena odnowienia znana z góry | Verris',
  description:
    'Ile kosztuje hosting? Jedna cena brutto, odnowienie po cenie z cennika. Policz w kalkulatorze dopłatę za dodatkową moc w szczycie.',
  alternates: { canonical: '/cennik' },
};

const W_CENIE: [string, string, string][] = [
  ['Przeniesienie strony, bazy i poczty', 'tak', '0 zł'],
  ["Certyfikaty SSL Let's Encrypt", 'tak, dla każdej domeny', '0 zł'],
  ['Kopie zapasowe z przywracaniem', 'tak, z ostatnich 30 dni', '0 zł'],
  ['Statystyki odwiedzin bez cookies', 'tak', '0 zł'],
  ['Moc ponad pakiet w szczycie', 'opcjonalnie', 'za czas użycia, do Twojego limitu'],
  ['Domena', 'nie', 'według cennika domen w panelu'],
];

const faqCennika = (c: CenaPakietu): [string, string][] => [
  [
    'Ile kosztuje hosting w Verris?',
    `${zl(c.miesiecznie)} miesięcznie albo ${zl(c.rocznie)} za rok (około ${zl(miesiecznieZRocznej(c))} miesięcznie). Ceny brutto; netto ${zl(netto(c.miesiecznie))} albo ${zl(netto(c.rocznie))}. Dodatkowa moc w szczycie jest opcjonalna i płatna za czas użycia, w blokach po 15 minut.`,
  ],
  [
    'Czy cena wzrośnie przy odnowieniu?',
    `Odnowienie idzie po cenie z cennika (dziś ${cenaPakietu(c)}), a przed odnowieniem wyślemy przypomnienie e-mail. ${RABAT_NA_START}`,
  ],
  ['Czy mogę wyłączyć odnawianie?', 'Tak, w panelu w każdej chwili, bez opłat.'],
  [
    'Czy muszę ustawić limit dopłat?',
    'Nie musisz. Bez limitu płacisz za faktyczne użycie dodatkowej mocy. Limit kosztu na 30 dni (suma dopłat z ostatnich 30 dni) ustawisz przy zamówieniu albo później w panelu. Gdy dopłaty go osiągną, zasoby wracają do pakietu, a Ty dostajesz powiadomienie.',
  ],
  [
    'Czy dostanę fakturę VAT?',
    'Tak. Fakturę wystawiamy przy każdej wpłacie pieniędzy: doładowaniu portfela, zapłacie za usługę BLIK-iem lub przelewem i każdym pobraniu z karty. Zakup usługi z portfela nie tworzy nowej faktury, bo rozlicza go faktura za doładowanie. Faktury znajdziesz w panelu.',
  ],
];

export default async function Page() {
  const ceny = await pobierzCeny();
  const FAQ = faqCennika(ceny.hosting);
  return (
    <main>
      <JsonLd
        data={productSchema({
          name: 'Hosting Verris z autoskalowaniem',
          description:
            `Jeden pakiet hostingu: ${cenaPakietu(ceny.hosting)}. W cenie 50 GB NVMe oraz limit 8 GB RAM i 2 vCPU; z autoskalowaniem do 1000 GB, 64 GB RAM i 24 vCPU według jawnych stawek.`,
          path: '/cennik',
          offers: ofertyHostingu(ceny),
        })}
      />
      <JsonLd data={faqSchema(FAQ)} />
      <SubHero
        eyebrow="Cennik hostingu"
        title="Jeden pakiet. Cenę odnowienia znasz z góry"
        lead={`Odnowienie idzie po cenie z cennika, którą widzisz tutaj. Płacisz ${zl(ceny.hosting.miesiecznie)} miesięcznie albo ${zl(ceny.hosting.rocznie)} za rok brutto (${zl(netto(ceny.hosting.miesiecznie))} albo ${zl(netto(ceny.hosting.rocznie))} netto), a dodatkową moc tylko wtedy, gdy Twoja strona naprawdę jej potrzebuje.`}
        crumbs={[{ label: 'Cennik' }]}
      />
      <Pricing naglowek={false} cena={ceny.hosting} />

      <section className="sec">
        <div className="wrap a-grid3">
          <Card>
            <h2 className="a-h3">Domeny</h2>
            <p>Cena rejestracji i odnowienia obok siebie, bez automatycznych odnowień.</p>
            <Link href="/domeny">Cennik domen →</Link>
          </Card>
          {VPS_W_SPRZEDAZY && (
            <Card>
              <h2 className="a-h3">Serwery VPS</h2>
              <p>Zasoby i wycenę VPS sprawdzisz w panelu — konfigurujesz go pod własne potrzeby.</p>
              <Link href="/vps">Plany VPS →</Link>
            </Card>
          )}
          <Card>
            <h2 className="a-h3">Jak zapłacisz</h2>
            <p>Kartą, BLIK-iem, szybkim przelewem albo Kredytami Verris z portfela w panelu.</p>
          </Card>
        </div>
      </section>

      <section className="sec sec-alt" id="kalkulator">
        <div className="wrap">
          <SectionHead
            eyebrow="Kalkulator dopłat"
            title="Ile kosztuje dodatkowa moc?"
            lead="Ustaw, ile mocy ponad pakiet może potrzebować Twoja strona w szczycie. Płacisz za czas, w którym ta moc była włączona. Jeśli ustawisz limit kosztu na 30 dni, dopłaty go nie przekroczą."
          />
          <AKalkulator wariant="pelny" ceny={ceny} />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead title="Co jest w cenie, a za co dopłacasz" />
          <table className="cmp2">
            <thead>
              <tr>
                <th scope="col">Usługa</th>
                <th scope="col">W pakiecie</th>
                <th scope="col">Dopłata</th>
              </tr>
            </thead>
            <tbody>
              {W_CENIE.map(([u, w, d]) => (
                <tr key={u}>
                  <th scope="row">{u}</th>
                  <td data-label="W pakiecie">{w}</td>
                  <td data-label="Dopłata" className="vr">
                    {d}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead title="Pytania o ceny" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="center-cta">
            <Link href="/hosting">Jak działa autoskalowanie</Link> · <Link href="/przenies-strone">Przeniesienie strony</Link> ·{' '}
            <Link href="/jak-wybrac-hosting">Jak wybrać hosting</Link>
          </p>
        </div>
      </section>

      <CTABand
        title={`Cenę odnowienia znasz z góry. Zacznij ${odCeny(ceny.hosting)}`}
        text="Odnowienie po cenie z cennika, przypomnienie przed każdym odnowieniem. Odnawianie wyłączysz w panelu w każdej chwili."
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <MobilnyPasek {...pasekHostingu(ceny)} />
    </main>
  );
}

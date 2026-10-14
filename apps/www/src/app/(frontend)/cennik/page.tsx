import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Card, CTABand, JsonLd, SectionHead, StickyBuy, SubHero } from '../components/ui';
import { Pricing } from '../components/Pricing';
import { AKalkulator } from '../components/AKalkulator';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';
import { faqSchema, HOSTING_OFFERS, productSchema } from '@/lib/schema';

// Makieta 14.10, plansza Cennik. Ceny brutto z lib/schema.ts (HOSTING_OFFERS), stawki z lib/kalkulator.ts.
export const metadata: Metadata = {
  title: 'Cennik hostingu — 45 zł/mies. lub 449 zł/rok | Verris',
  description:
    'Ile kosztuje hosting? 45 zł/mies. albo 449 zł/rok brutto, ta sama cena przy odnowieniu. Policz w kalkulatorze dopłatę za dodatkową moc w szczycie.',
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

const FAQ: [string, string][] = [
  [
    'Ile kosztuje hosting w Verris?',
    '45 zł miesięcznie albo 449 zł za rok (około 37 zł miesięcznie). Ceny brutto. Dodatkowa moc w szczycie jest opcjonalna i płatna za czas użycia, w blokach po 15 minut.',
  ],
  [
    'Czy cena wzrośnie przy odnowieniu?',
    'Nie ma promocji na pierwszy okres. Odnowienie idzie po cenie z cennika (dziś 45 zł/mies. albo 449 zł/rok brutto), a przed odnowieniem wyślemy przypomnienie e-mail.',
  ],
  ['Czy mogę wyłączyć odnawianie?', 'Tak, w panelu w każdej chwili, bez opłat.'],
  [
    'Co, jeśli zapomnę o limicie dopłat?',
    'Limit kosztu autoskalowania ustawiasz w panelu. Gdy dopłaty go osiągną, zasoby wracają do pakietu, a Ty dostajesz powiadomienie.',
  ],
  ['Czy dostanę fakturę VAT?', 'Tak. Fakturę VAT po każdej płatności znajdziesz w panelu, a powiadomienie o niej dostajesz e-mailem.'],
];

export default function Page() {
  return (
    <main>
      <JsonLd
        data={productSchema({
          name: 'Hosting Verris z autoskalowaniem',
          description:
            'Jeden pakiet hostingu: 45 zł/mies. albo 449 zł/rok brutto. W cenie 50 GB NVMe, do 8 GB RAM i do 2 vCPU; dodatkowa moc w piku według jawnych stawek.',
          path: '/cennik',
          offers: HOSTING_OFFERS,
        })}
      />
      <JsonLd data={faqSchema(FAQ)} />
      <SubHero
        eyebrow="Cennik hostingu"
        title="Jeden pakiet, jedna cena. Także za rok"
        lead="Nie ma u nas taniego pierwszego roku i drogiego drugiego. Płacisz 45 zł miesięcznie albo 449 zł za rok, a dodatkową moc tylko wtedy, gdy Twoja strona naprawdę jej potrzebuje."
        crumbs={[{ label: 'Cennik' }]}
      />
      <Pricing naglowek={false} />

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
            lead="Ustaw, ile mocy ponad pakiet może potrzebować Twoja strona w szczycie. Płacisz za czas, w którym ta moc była włączona, i nigdy więcej niż limit z panelu."
          />
          <AKalkulator wariant="pelny" />
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
        title="Uczciwa cena dziś i za rok. Zacznij od 45 zł"
        text="Bez promocji na pierwszy rok i bez niespodzianek przy odnowieniu. Odnawianie wyłączysz w panelu w każdej chwili."
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <StickyBuy />
    </main>
  );
}

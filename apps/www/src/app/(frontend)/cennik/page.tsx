import Link from 'next/link';
import type { Metadata } from 'next';
import { SubHero, CTABand } from '../components/ui';
import { Pricing } from '../components/Pricing';
import { RevealInit } from '../components/RevealInit';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';

export const metadata: Metadata = {
  title: 'Cennik hostingu — 45 zł/mies lub 399 zł/rok brutto | Verris',
  description:
    'Jeden pakiet hostingu z autoskalowaniem: 45 zł/mies lub 399 zł/rok brutto. Baza 50 GB NVMe, do 8 GB RAM, do 2 vCPU — skalowanie do 1000 GB, 64 GB, 24 vCPU. Bez limitu stron i skrzynek, SSL i migracja w cenie.',
  alternates: { canonical: '/cennik' },
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Cennik"
        title="Jedna cena. Bez gwiazdek."
        lead={`Cena z cennika obowiązuje od pierwszego dnia — bez taniej przynęty na pierwszy okres i bez szoku przy odnowieniu. ${VPS_W_SPRZEDAZY ? 'VPS i domeny mają' : 'Domeny mają'} osobną wycenę w panelu.`}
        crumbs={[{ label: 'Cennik' }]}
      />
      <Pricing />
      <section className="band">
        <div className="wrap">
          <div className="prose rv">
            {VPS_W_SPRZEDAZY ? (
              <>
                <h2>Co z VPS i domenami?</h2>
                <p>
                  Powyższa cena dotyczy hostingu współdzielonego z autoskalowaniem. Zasoby i wycenę{' '}
                  <Link href="/vps">VPS</Link> oraz dostępność i ceny <Link href="/domeny">domen</Link> sprawdzisz w
                  panelu — konfigurujesz je pod własne potrzeby.
                </p>
              </>
            ) : (
              <>
                <h2>Co z domenami?</h2>
                <p>
                  Powyższa cena dotyczy hostingu współdzielonego z autoskalowaniem. Dostępność i ceny{' '}
                  <Link href="/domeny">domen</Link> sprawdzisz w panelu.
                </p>
              </>
            )}
            <h2>Jak płacisz</h2>
            <p>
              Kartą, BLIK-iem, Apple Pay, Google Pay, przelewem online (Stripe) lub Kredytami Verris.
              Fakturę VAT wystawiamy w programie księgowym zintegrowanym z KSeF — jej numer zobaczysz w panelu. Odnowienie następuje według
              cennika z dnia odnowienia — przypomnimy e-mailem, a odnawianie wyłączysz w panelu w
              każdej chwili, bez opłat.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Zacznij z Verris"
        text="Załóż konto i przenieś stronę za darmo — resztą przeprowadzki zajmiemy się my."
        secondary={{ label: 'Jak działa migracja', href: '/przenies-strone' }}
      />
      <RevealInit />
    </main>
  );
}

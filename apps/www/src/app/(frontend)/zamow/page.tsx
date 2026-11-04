import type { Metadata } from 'next';
import { Breadcrumbs } from '../components/ui';
import { AZamowienie } from '../components/AZamowienie';
import { pobierzCeny } from '@/lib/ceny-api';

// Makieta 14.10, plansza Zamowienie. Strona przejściowa do panelu — bez indeksowania (mapa strony: „bez indeksowania”).
export const metadata: Metadata = {
  title: 'Zamów hosting w trzech krokach | Verris',
  description: 'Zamów hosting Verris: wybierz domenę i okres rozliczenia, a konto i płatność dokończysz w panelu. Cena brutto, odnowienie po cenie z cennika.',
  alternates: { canonical: '/zamow' },
  robots: { index: false, follow: true },
};

export default async function Page() {
  const ceny = await pobierzCeny();
  return (
    <main>
      <section className="sec a-order-sec">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <Breadcrumbs items={[{ label: 'Zamówienie' }]} />
          <h1 className="a-order-h1">Zamów hosting w trzech krokach</h1>
          <AZamowienie cena={ceny.hosting} />
        </div>
      </section>
    </main>
  );
}

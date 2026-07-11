import type { Metadata } from 'next';
import { SubHero, CTABand } from '../../components/ui';
import { RevealInit } from '../../components/RevealInit';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Hosting pod sklep i WooCommerce | Verris',
  description:
    'Hosting dla sklepu internetowego z autoskalowaniem — moc rośnie w Black Friday i w szczycie sprzedaży, a po piku zwalnia. SSL, kopie i migracja w cenie. 39 zł/mies lub 349 zł/rok brutto.',
  alternates: { canonical: '/hosting/sklep' },
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Hosting dla e-commerce"
        title="Sklep, który nie pada w piku sprzedaży"
        lead="Black Friday, wysyłka newslettera, wejście do mediów — właśnie wtedy sklep potrzebuje mocy. Autoskalowanie doda ją automatycznie i rozliczy godzinowo, tylko za czas piku."
        crumbs={[{ label: 'Hosting', href: '/hosting' }, { label: 'Sklep' }]}
        primary={{ label: 'Załóż konto', href: PANEL, conv: 'checkout_intent', plan: 'hosting' }}
        secondary={{ label: 'Policz koszt', href: '/przenies-strone#kalkulator' }}
      />
      <section>
        <div className="wrap">
          <div className="prose rv">
            <h2>Dlaczego sklep na Verris</h2>
            <ul>
              <li>Autoskalowanie do 24 vCPU i 64 GB RAM — pik sprzedaży nie kończy się błędem 503.</li>
              <li>Płacisz za realne użycie, nie za najdroższy pakiet „na wszelki wypadek".</li>
              <li>SSL w cenie — koszyk i płatności po HTTPS bez dopłat.</li>
              <li>Kopie zapasowe z odtwarzaniem, gdy aktualizacja wtyczki pójdzie nie tak.</li>
              <li>Dane Twoje i Twoich klientów zostają w Europie (serwery Hetzner, Niemcy/Finlandia).</li>
            </ul>
            <p>
              Prowadzisz sklep na WordPressie z WooCommerce? Zobacz też{' '}
              <a href="/hosting/wordpress">hosting WordPress</a>, a orientacyjny koszt piku policzysz
              w <a href="/przenies-strone#kalkulator">kalkulatorze autoskalowania</a>.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Przygotuj sklep na sezon"
        text="Przenieś go do Verris za 0 zł i wejdź w pik z zapasem mocy na żądanie."
        secondary={{ label: 'Jak działa migracja', href: '/przenies-strone' }}
      />
      <RevealInit />
    </main>
  );
}

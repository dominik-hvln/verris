import type { Metadata } from 'next';
import { SubHero, CTABand } from '../../components/ui';
import { RevealInit } from '../../components/RevealInit';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Hosting WordPress z autoskalowaniem | Verris',
  description:
    'Hosting WordPress na DirectAdmin, zoptymalizowany pod WP: obsługa starych wersji PHP, kopie z odtwarzaniem, SSL i migracja za 0 zł. Autoskalowanie łapie piki ruchu. 39 zł/mies lub 349 zł/rok brutto.',
  alternates: { canonical: '/hosting/wordpress' },
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Hosting WordPress"
        title="WordPress, który wytrzyma pik"
        lead="Hosting zoptymalizowany pod WordPress. Gdy wpis wejdzie na home albo ruszy kampania, autoskalowanie doda mocy — a po piku ją zwolni. Bez pakietu na zapas."
        crumbs={[{ label: 'Hosting', href: '/hosting' }, { label: 'WordPress' }]}
        primary={{ label: 'Załóż konto', href: PANEL, conv: 'checkout_intent', plan: 'hosting' }}
        secondary={{ label: 'Przenieś WordPressa', href: '/przenies-strone' }}
      />
      <section>
        <div className="wrap">
          <div className="prose rv">
            <h2>Dlaczego WordPress na Verris</h2>
            <ul>
              <li>Autoskalowanie CPU/RAM/dysku — pik kampanii nie kładzie strony.</li>
              <li>Obsługa starych wersji PHP, gdy motyw lub wtyczka jeszcze nie nadążyły.</li>
              <li>Kopie zapasowe z samodzielnym odtwarzaniem w DirectAdmin.</li>
              <li>Certyfikat SSL Let’s Encrypt i migracja w cenie — 0 zł.</li>
              <li>Przywracanie kopii wybiórczo: pliki, baza, poczta — z domyślną kopią bezpieczeństwa przed operacją.</li>
            </ul>
            <h2>Przenieś istniejącą stronę WordPress</h2>
            <p>
              Przeniesienie WordPressa to skopiowanie plików, bazy danych i konfiguracji. W Verris
              zrobi to za Ciebie zespół w ramach darmowej migracji — wystarczy przekazać dostępy.
              Możesz też użyć migratora w panelu. Szczegóły na stronie{' '}
              <a href="/przenies-strone">przeniesienia strony</a>.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Postaw WordPressa na hostingu bez gwiazdek"
        text="39 zł/mies lub 349 zł/rok brutto — migracja i SSL w cenie."
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <RevealInit />
    </main>
  );
}

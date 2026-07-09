import type { Metadata } from 'next';
import { Gauge, Move, ShieldCheck, Database, BarChart3, Wrench } from 'lucide-react';
import { SubHero, CTABand, JsonLd } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { PANEL } from '@/lib/site';
import { serviceSchema, HOSTING_OFFERS } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Hosting z autoskalowaniem — 39 zł/mies | Verris',
  description:
    'Hosting współdzielony z autoskalowaniem na DirectAdmin. Baza 50 GB NVMe, 8 GB RAM, 2 vCPU — skalowanie do 1000 GB, 64 GB RAM, 24 vCPU. Migracja i SSL za 0 zł, bez limitu stron i skrzynek. 39 zł/mies lub 349 zł/rok brutto.',
  alternates: { canonical: '/hosting' },
};

const FEATURES = [
  { icon: Gauge, h: 'Autoskalowanie', p: 'Moc rośnie w piku i zwalnia w trybie ECO. Płacisz godzinowo tylko za nadwyżkę ponad bazę.' },
  { icon: Move, h: 'Migracja 0 zł', p: 'Przeprowadzkę strony i poczty robi zespół albo migrator w panelu — bez przestoju i bez limitu plików.' },
  { icon: ShieldCheck, h: 'SSL i SLA w cenie', p: 'Certyfikat Let’s Encrypt bez dopłat oraz SLA 99,5% z rekompensatami zapisanymi w regulaminie.' },
  { icon: Database, h: 'Kopie zapasowe', p: 'Backup i samodzielne odtwarzanie z poziomu DirectAdmin — bez czekania na support.' },
  { icon: BarChart3, h: 'Analityka bez cookies', p: 'Statystyki odwiedzin bez danych osobowych i bez banera zgód — działa od razu.' },
  { icon: Wrench, h: 'DirectAdmin + WordPress', p: 'Wygodny panel, obsługa starych wersji PHP i konfiguracja zoptymalizowana pod WordPress.' },
];

export default function HostingPage() {
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'Hosting z autoskalowaniem',
          description:
            'Hosting współdzielony na DirectAdmin z autoskalowaniem CPU/RAM/dysku. Baza 50 GB NVMe, 8 GB RAM, 2 vCPU; skalowanie do 1000 GB, 64 GB RAM, 24 vCPU. Migracja i SSL za 0 zł.',
          path: '/hosting',
          offers: HOSTING_OFFERS,
        })}
      />
      <SubHero
        eyebrow="Hosting współdzielony"
        title="Hosting z autoskalowaniem"
        lead="Jeden pakiet, który rośnie razem z Twoją stroną. Bazę masz w cenie, a w piku ruchu zasoby rosną automatycznie — i wracają, gdy ruch spada. Płacisz tyle, ile widzisz."
        crumbs={[{ label: 'Hosting' }]}
        primary={{ label: 'Załóż konto', href: PANEL, conv: 'begin_checkout' }}
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />

      <section>
        <div className="wrap">
          <div className="sec-head left rv">
            <p className="kicker">Co dostajesz</p>
            <h2>Wszystko dla strony firmowej, bloga i sklepu</h2>
          </div>
          <div className="grid-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div className="icard rv" key={f.h}>
                  <div className="ico"><Icon /></div>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="prose rv">
            <h2>Jak działa autoskalowanie hostingu</h2>
            <p>
              Klasyczny hosting zmusza Cię do wyboru pakietu „na zapas" — przez większość roku
              płacisz za moc, której strona nie używa, a i tak brakuje jej w szczycie kampanii.
              Verris odwraca ten model: dostajesz konkretną bazę zasobów, a nadwyżka nalicza się
              godzinowo tylko wtedy, gdy naprawdę jej potrzebujesz.
            </p>
            <ul>
              <li>Baza w cenie: 50 GB NVMe, 8 GB RAM, 2 vCPU (CloudLinux).</li>
              <li>Autoskalowanie do 1000 GB dysku, 64 GB RAM i 24 vCPU — do 12× mocy CPU względem bazy.</li>
              <li>Tryb ECO zwalnia nadwyżkę po piku, a naliczanie się kończy.</li>
              <li>Bez limitu stron, skrzynek i transferu — w ramach zasobów konta i zasad fair use.</li>
            </ul>
            <p>
              Orientacyjny koszt nadwyżki policzysz w{' '}
              <a href="/przenies-strone#kalkulator">kalkulatorze autoskalowania</a>, a szczegóły
              znajdziesz na stronie <a href="/funkcje/autoskalowanie">funkcji autoskalowania</a>.
            </p>
            <h3>Dla kogo</h3>
            <p>
              Dla firm i JDG przenoszących stronę z drogich odnowień, dla{' '}
              <a href="/hosting/wordpress">stron WordPress</a> i{' '}
              <a href="/hosting/sklep">sklepów</a>, które łapią piki sprzedażowe, oraz dla każdego,
              kto woli płacić za realne zużycie niż za pakiet na zapas.
            </p>
          </div>
        </div>
      </section>

      <CTABand
        title="Przenieś stronę bez przestoju. Za 0 zł."
        text="Załóż konto, przekaż dostępy — resztą przeprowadzki zajmiemy się my."
        secondary={{ label: 'Jak działa migracja', href: '/przenies-strone' }}
      />
      <RevealInit />
    </main>
  );
}

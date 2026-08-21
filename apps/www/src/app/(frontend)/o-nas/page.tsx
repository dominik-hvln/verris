import type { Metadata } from 'next';
import { SubHero, CTABand } from '../components/ui';
import { RevealInit } from '../components/RevealInit';

export const metadata: Metadata = {
  title: 'O Verris — polski hosting z uczciwymi zasadami',
  description:
    'Verris to polski hosting z autoskalowaniem, VPS i domenami. Operator: HVLN Dominik Kowalski, Zielona Góra. Budujemy zaufanie konkretami: automatyczne rekompensaty za awarie, jedna cena bez pułapek, darmowa migracja strony i poczty.',
  alternates: { canonical: '/o-nas' },
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="O nas"
        title="Hosting, który gra w otwarte karty"
        lead="Verris to młoda polska marka hostingowa. Zaufanie budujemy konkretami — awaria oznacza automatyczną rekompensatę, cena jest jedna od pierwszego dnia, a migrację robimy za 0 zł — a nie pustymi obietnicami."
        crumbs={[{ label: 'O nas' }]}
      />
      <section>
        <div className="wrap">
          <div className="prose rv">
            <h2>Po co powstał Verris</h2>
            <p>
              Rynek hostingu przyzwyczaił firmy do tanich pierwszych okresów i drogich odnowień, do
              pakietów dobieranych „na zapas" i do gwiazdek w cenniku. Chcieliśmy zrobić to inaczej:
              jedna cena od pierwszego dnia, zasoby, które rosną z ruchem, i zero ukrytych dopłat za
              SSL czy migrację.
            </p>
            <h2>W co wierzymy</h2>
            <ul>
              <li>Obietnice tylko z pokryciem — SLA 99,5% z rekompensatami wpisanymi w regulamin.</li>
              <li>Ceny brutto, jasno; bez pułapek odnowieniowych i cichych auto-odnowień domen.</li>
              <li>Realna pomoc, gdy jej potrzebujesz — odpowiadamy tego samego dnia roboczego, bez formułek.</li>
              <li>Konkret techniczny zamiast marketingowej waty.</li>
            </ul>
            <h2>Infrastruktura</h2>
            <p>
              Usługi opieramy na infrastrukturze w Unii Europejskiej (Hetzner, Niemcy/Finlandia), więc
              dane pozostają w EOG. Więcej o gwarancjach przeczytasz na stronie{' '}
              <a href="/funkcje/sla">SLA</a> i <a href="/funkcje/rodo-i-dpa">RODO/DPA</a>.
            </p>
            <h2>Operator</h2>
            <p>
              Usługę świadczy <strong>HVLN Dominik Kowalski</strong> z siedzibą w Zielonej Górze (NIP
              9292069367). Masz pytanie? <a href="/kontakt">Napisz do nas</a>.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Dołącz do Verris"
        text="Załóż konto i przekonaj się, jak wygląda hosting bez gwiazdek."
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <RevealInit />
    </main>
  );
}

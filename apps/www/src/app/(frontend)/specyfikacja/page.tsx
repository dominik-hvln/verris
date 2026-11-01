import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SPECYFIKACJA_OPUBLIKOWANA } from '@/lib/oferta';
import { CENY_ZAPASOWE } from '@/lib/ceny';
import { sekcjeWidoczne } from '@/lib/specyfikacja';
import { HOSTING_OFFERS, productSpecSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';
import { CTABand, JsonLd, SectionHead, SubHero } from '../components/ui';

export const metadata: Metadata = {
  title: 'Parametry hostingu: zasoby, PHP, kopie, SLA | Verris',
  description:
    'Specyfikacja hostingu Verris: 50 GB NVMe, limit 8 GB RAM, autoskalowanie do 24 vCPU, LiteSpeed, PHP 7.4–8.3, kopie z 30 dni i SLA 99,5%. 45 zł/mies.',
  alternates: { canonical: '/specyfikacja' },
};

/**
 * PB-07 — publiczna specyfikacja pakietu, układ z makiety 14.10 (Specyfikacja.dc.html). Każdy wiersz ma pokrycie
 * w macierzy audytu (audyt/dane/macierz.csv). Wiersze `poWeryfikacji` pokazujemy tylko przy SPEC_PO_WERYFIKACJI
 * (lib/oferta.ts). Lokalizacji centrów danych nie podajemy (brief 14.10: „dane w UE”).
 */

export default function Page() {
  if (!SPECYFIKACJA_OPUBLIKOWANA) notFound();
  // Stawki z wartości zapasowych modułu cen (te same co w API 1.11.2026); strona zostaje synchroniczna.
  const sekcje = sekcjeWidoczne(CENY_ZAPASOWE.stawki);
  return (
    <main>
      <JsonLd
        data={productSpecSchema({
          name: 'Hosting Verris z autoskalowaniem',
          description:
            'Jeden pakiet hostingu: 50 GB NVMe, limit 8 GB RAM i 2 vCPU, autoskalowanie do 24 vCPU, 64 GB RAM i 1000 GB dysku.',
          path: '/specyfikacja',
          properties: sekcje.flatMap((s) => s.wiersze.map(([k, v]): [string, string] => [k, v])),
          offers: HOSTING_OFFERS,
        })}
      />
      <SubHero
        eyebrow="Specyfikacja"
        title="Wszystkie parametry. Bez gwiazdek i drobnego druku"
        lead="Jeden pakiet, jedna specyfikacja. Jeśli czegoś tu nie ma, napisz — odpowiemy wprost, czy to mamy."
        crumbs={[{ label: 'Specyfikacja' }]}
        primary={{ label: 'Zamów hosting', href: ZAMOW }}
        secondary={{ label: 'Porównaj z cennikiem', href: '/cennik' }}
      />
      {sekcje.map((s, i) => (
        <section className={`sec${i % 2 ? ' sec-alt' : ''}`} key={s.id} aria-labelledby={`sp-${s.id}`}>
          <div className="wrap c-narrow">
            <SectionHead id={`sp-${s.id}`} title={s.tytul} />
            <div className="c-tablewrap">
              <table className="c-spec">
                <thead>
                  <tr>
                    <th scope="col">Parametr</th>
                    <th scope="col">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {s.wiersze.map(([p, w]) => (
                    <tr key={p}>
                      <th scope="row">{p}</th>
                      <td>{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
      <CTABand
        title="Parametry się zgadzają? Zacznij od przeprowadzki"
        text="45 zł/mies albo 449 zł/rok brutto, ta sama cena przy odnowieniu. Przeniesienie strony robimy za Ciebie."
        secondary={{ label: 'Wszystkie funkcje', href: '/funkcje' }}
      />
    </main>
  );
}

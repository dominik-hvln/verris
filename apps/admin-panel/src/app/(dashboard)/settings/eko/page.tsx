import { bramkaStrony } from '@/lib/bramka-strony';
import { BladStrony, wynik } from '@/components/blad-strony';
import { fetchPanelDrzew } from './actions';
import { UstawieniaDrzewForm } from './ustawienia-drzew-form';
import { ZamowieniaSadzenia } from './zamowienia-sadzenia';

export const dynamic = 'force-dynamic';

/** W6 (decyzja 12) — program EKO: drzewa u partnera sadzenia (posadzimy.pl), pula, zamówienia, certyfikaty. */
export default async function UstawieniaEkoPage() {
  const bramka = await bramkaStrony("/settings/eko");
  if (bramka) return bramka;
  const w = await wynik(fetchPanelDrzew());
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Program EKO i drzewa" powrot={{ href: '/', label: 'Pulpit' }} />;
  const p = w.dane;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Program EKO i drzewa</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Każda opłacona usługa dokłada część drzewa do wspólnej puli; klienci mogą też wymieniać punkty. Harmonogram
          (co godzinę) zamawia drzewa u posadzimy.pl, gdy pula ma pełne drzewo i starcza kredytów API. Klient widzi
          drzewo jako posadzone dopiero z certyfikatem. Token API wpisuje się skryptem prod-ustaw-klucze.sh
          ({p.envTokenow.produkcja} / {p.envTokenow.test}), nie tutaj.
        </p>
      </header>
      <UstawieniaDrzewForm panel={p} />
      <ZamowieniaSadzenia panel={p} />
    </div>
  );
}

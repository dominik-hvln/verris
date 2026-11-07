import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeaderRow } from '@/components/panel';
import { blokadaNowejStrony } from '@/lib/kreator';
import { stanKreatora } from '../akcje';
import { BrakDostepu } from '../brak-dostepu';
import { Komunikat, klasaPrzyciskuDrugiego } from '../wspolne';
import { KreatorBriefu } from './kreator-briefu';

export const dynamic = 'force-dynamic';

export default async function NowaStronaPage() {
  const stan = await stanKreatora();
  const naglowek = (
    <PageHeaderRow
      title="Nowa strona"
      description="Trzy krótkie kroki. Po wysłaniu AI przygotuje stronę w około minutę – potem zmienisz w niej wszystko."
      actions={
        <Link href="/dashboard/kreator" className={klasaPrzyciskuDrugiego}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Wszystkie strony
        </Link>
      }
    />
  );
  if (!stan.ok || !stan.dane.dostep || !stan.dane.wersja) {
    return (
      <div className="space-y-6">
        {naglowek}
        <BrakDostepu powod={stan.ok ? stan.dane.powod : 'Nie udało się wczytać kreatora – odśwież stronę za chwilę.'} zamowHosting={stan.ok && !!stan.dane.powod?.includes('Zamów hosting')} />
      </div>
    );
  }
  const blokada = blokadaNowejStrony(stan.dane);
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {naglowek}
      {blokada ? (
        <Komunikat rodzaj="ostrzezenie" tytul="Nie możesz teraz zacząć nowej strony">
          {blokada}
        </Komunikat>
      ) : (
        <KreatorBriefu wersja={stan.dane.wersja} />
      )}
    </div>
  );
}

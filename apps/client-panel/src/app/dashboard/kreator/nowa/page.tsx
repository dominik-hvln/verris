import { PageHeaderRow } from '@/components/panel';
import { StronaSkupienia } from '@/components/panel/tryb-skupienia';
import { blokadaNowejStrony } from '@/lib/kreator';
import { stanKreatora } from '../akcje';
import { BrakDostepu } from '../brak-dostepu';
import { Komunikat } from '../wspolne';
import { KreatorBriefu } from './kreator-briefu';

export const dynamic = 'force-dynamic';

export default async function NowaStronaPage() {
  const stan = await stanKreatora();
  // Tryb skupienia: powrót do listy stron daje „← Panel” w pasku (wcześniej „Wszystkie strony” w nagłówku).
  const naglowek = (
    <PageHeaderRow
      title="Nowa strona"
      description="Trzy krótkie kroki. Po wysłaniu AI przygotuje stronę w około minutę – potem zmienisz w niej wszystko."
    />
  );
  if (!stan.ok || !stan.dane.dostep || !stan.dane.wersja) {
    return (
      <StronaSkupienia>
        <div className="space-y-6">
          {naglowek}
          <BrakDostepu powod={stan.ok ? stan.dane.powod : 'Nie udało się wczytać kreatora – odśwież stronę za chwilę.'} zamowHosting={stan.ok && !!stan.dane.powod?.includes('Zamów hosting')} />
        </div>
      </StronaSkupienia>
    );
  }
  const blokada = blokadaNowejStrony(stan.dane);
  return (
    <StronaSkupienia>
      <div className="space-y-6 animate-in fade-in duration-500 motion-reduce:animate-none">
        {naglowek}
        {blokada ? (
          <Komunikat rodzaj="ostrzezenie" tytul="Nie możesz teraz zacząć nowej strony">
            {blokada}
          </Komunikat>
        ) : (
          <KreatorBriefu wersja={stan.dane.wersja} />
        )}
      </div>
    </StronaSkupienia>
  );
}

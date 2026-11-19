import { StronaSkupienia } from '@/components/panel/tryb-skupienia';
import { blokadaNowejMarki, POWROT_MARKI } from '@/lib/kreator-marki';
import { BrakDostepu } from '../../kreator/brak-dostepu';
import { stanKreatoraMarki } from '../akcje';
import { NaglowekMarki } from '../naglowek-skupienia';
import { NowaMarka } from './nowa-marka';

export const dynamic = 'force-dynamic';

/** Paczka 131 – „Nowa marka”: brief w trybie skupienia; wysłanie = szkic marki + pierwsza seria 6 kierunków. */
export default async function NowaMarkaPage() {
  const stan = await stanKreatoraMarki();
  if (!stan.ok || !stan.dane.dostepny) {
    return (
      <StronaSkupienia powrot={POWROT_MARKI}>
        <BrakDostepu
          tytul="Kreator marki jest niedostępny na tym koncie"
          powod={!stan.ok ? (stan.status === 403 ? stan.blad : 'Nie udało się wczytać Kreatora marki – odśwież stronę za chwilę.') : 'Kreator marki działa z hostingiem Verris.'}
        />
      </StronaSkupienia>
    );
  }
  const blokada = blokadaNowejMarki(stan.dane);
  return (
    <StronaSkupienia powrot={POWROT_MARKI} szeroka>
      <NaglowekMarki
        tytul="Nowa marka"
        opis="Opisz firmę. Asystent ułoży 6 różnych kierunków z wektorowych szablonów kształtów i krojów na licencji SIL OFL – kolor, krój i układ zmienisz potem bez AI."
        stan={stan.dane}
      />
      <NowaMarka blokada={blokada?.powod ?? null} />
    </StronaSkupienia>
  );
}

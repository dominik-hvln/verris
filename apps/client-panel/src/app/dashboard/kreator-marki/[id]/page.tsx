import { StronaSkupienia } from '@/components/panel/tryb-skupienia';
import { getWalletSummary } from '@/app/dashboard/billing/data';
import { POWROT_MARKI } from '@/lib/kreator-marki';
import { listaStron } from '../../kreator/akcje';
import { BrakDostepu } from '../../kreator/brak-dostepu';
import { pobierzMarke, stanKreatoraMarki } from '../akcje';
import { EkranMarki } from '../ekran-marki';

export const dynamic = 'force-dynamic';

const TYTUL = 'Kreator marki jest niedostępny na tym koncie';

/**
 * Paczka 131 – ekran marki w trybie skupienia: kroki brief/analiza → propozycje → Dopasuj → zasady → materiały →
 * eksport (`?krok=`). Lista stron Kreatora stron – do „Użyj w Kreatorze stron” (brak kreatora = sam link).
 */
export default async function MarkaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ krok?: string; blad?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [stan, widok] = await Promise.all([stanKreatoraMarki(), pobierzMarke(id)]);
  if (!stan.ok || !stan.dane.dostepny) {
    return (
      <StronaSkupienia powrot={POWROT_MARKI}>
        <BrakDostepu
          tytul={TYTUL}
          powod={!stan.ok ? (stan.status === 403 ? stan.blad : 'Nie udało się wczytać Kreatora marki – odśwież stronę za chwilę.') : 'Kreator marki działa z hostingiem Verris.'}
        />
      </StronaSkupienia>
    );
  }
  if (!widok.ok) {
    return (
      <StronaSkupienia powrot={POWROT_MARKI}>
        <BrakDostepu tytul="Nie znaleziono marki" powod={widok.status === 404 ? 'Ta marka nie istnieje albo została usunięta.' : widok.blad} />
      </StronaSkupienia>
    );
  }
  const [strony, paynowDostepny] = await Promise.all([
    listaStron().then((w) => (w.ok ? w.dane : null)).catch(() => null),
    getWalletSummary()
      .then((w) => w.paynowDostepny === true)
      .catch(() => false),
  ]);
  return (
    <StronaSkupienia powrot={POWROT_MARKI} szeroka>
      <EkranMarki widok={widok.dane} stan={stan.dane} krok={sp.krok ?? null} strony={strony} paynowDostepny={paynowDostepny} bladSerii={sp.blad === 'seria'} />
    </StronaSkupienia>
  );
}

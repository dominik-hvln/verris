import { PageHeaderRow } from '@/components/panel';
import { pobierzStrone, stanKreatora } from '../akcje';
import { BrakDostepu } from '../brak-dostepu';
import { StronaKreatora } from './strona-kreatora';

export const dynamic = 'force-dynamic';

export default async function EdytorStronyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [stan, strona] = await Promise.all([stanKreatora(), pobierzStrone(id)]);
  if (!stan.ok || !stan.dane.dostep || !stan.dane.plan) {
    return (
      <div className="space-y-6">
        <PageHeaderRow title="Kreator stron" />
        <BrakDostepu powod={stan.ok ? stan.dane.powod : 'Nie udało się wczytać kreatora – odśwież stronę za chwilę.'} zamowHosting={stan.ok && !!stan.dane.powod?.includes('Zamów hosting')} />
      </div>
    );
  }
  if (!strona.ok) {
    return (
      <div className="space-y-6">
        <PageHeaderRow title="Kreator stron" />
        <BrakDostepu powod={strona.status === 404 ? 'Nie znaleziono tej strony – mogła zostać usunięta.' : strona.blad} />
      </div>
    );
  }
  return <StronaKreatora widok={strona.dane} stan={stan.dane} />;
}

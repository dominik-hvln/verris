import { StronaSkupienia } from '@/components/panel/tryb-skupienia';
import { blokadaNowejMarki, POWROT_MARKI } from '@/lib/kreator-marki';
import { BrakDostepu } from '../../kreator/brak-dostepu';
import { stanKreatoraMarki } from '../akcje';
import { NaglowekMarki } from '../naglowek-skupienia';
import { WgrywanieLogo } from './wgrywanie-logo';

export const dynamic = 'force-dynamic';

/**
 * Paczka 131 – ścieżki „Mam logo – Key Visual” (`?zrodlo=wgrane`, logo zostaje bez zmian) i „Odśwież logo”
 * (`?zrodlo=odswiezenie`, 3 kierunki): wgranie pliku z oświadczeniem o prawach, potem analiza na ekranie marki.
 */
export default async function WgrajLogoPage({ searchParams }: { searchParams: Promise<{ zrodlo?: string }> }) {
  const [stan, { zrodlo: z }] = await Promise.all([stanKreatoraMarki(), searchParams]);
  const zrodlo = z === 'odswiezenie' ? 'odswiezenie' : 'wgrane';
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
  const b = blokadaNowejMarki(stan.dane);
  // Key Visual nie zużywa serii propozycji – blokuje go tylko liczba marek; odświeżenie potrzebuje też serii.
  const blokada = b && (zrodlo === 'odswiezenie' || stan.dane.limity.marki.uzyte >= stan.dane.limity.marki.limit) ? b.powod : null;
  return (
    <StronaSkupienia powrot={POWROT_MARKI} szeroka>
      <NaglowekMarki
        tytul={zrodlo === 'odswiezenie' ? 'Odśwież logo' : 'Mam logo – Key Visual'}
        opis={
          zrodlo === 'odswiezenie'
            ? 'Odczytamy kolory, proporcje i elementy, odtworzymy wersję wektorową i pokażemy 3 kierunki odświeżenia.'
            : 'Logo zostaje bez zmian. Odczytamy z niego kolory i dobudujemy paletę, wzór i gotowe materiały.'
        }
        stan={stan.dane}
      />
      <WgrywanieLogo zrodlo={zrodlo} maksMb={stan.dane.maksWgraniaMb} blokada={blokada} />
    </StronaSkupienia>
  );
}

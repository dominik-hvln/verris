'use client';

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { Obraz } from '@verris/kreator/klient';
import { klasaPrzyciskuDrugiego } from '../../wspolne';
import { MiniaturaZasobu } from './miniatura-zasobu';
import { WyborZdjecia } from './wybor-zdjecia';

/**
 * Paczka 122 – zdjęcie w polu obrazu formularza sekcji: miniatura (zdjęcie z biblioteki) albo informacja o ramce
 * zastępczej i przycisk otwierający WyborZdjecia. Wynik dialogu zastępuje cały obiekt Obraz w modelu.
 */
export function PoleZdjecia({ obraz, sciezka, stronaId, onWybierz }: { obraz: Obraz; sciezka: string; stronaId?: string; onWybierz: (o: Obraz) => void }) {
  const [otwarty, setOtwarty] = useState(false);
  const zZasobu = !!obraz.zasobId && obraz.zrodlo !== 'placeholder';
  return (
    <div className="flex items-center gap-3 rounded-[6px] bg-raised px-2.5 py-2">
      {zZasobu ? (
        <MiniaturaZasobu zasobId={obraz.zasobId!} alt={obraz.alt} />
      ) : (
        <span className="flex h-16 w-24 flex-none items-center justify-center rounded-[6px] border border-dashed border-line-strong" aria-hidden>
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="text-[12px] text-muted-foreground">
          {zZasobu ? 'Zdjęcie z Twojej biblioteki.' : obraz.url ? 'Zdjęcie jest już na stronie.' : 'Na stronie jest elegancka ramka z podpisem – wybierz zdjęcie.'}
        </span>
        <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => setOtwarty(true)}>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> {zZasobu || obraz.url ? 'Zmień zdjęcie' : 'Wybierz zdjęcie'}
        </button>
      </div>
      <WyborZdjecia obraz={obraz} sciezka={sciezka} stronaId={stronaId} otwarty={otwarty} onWybierz={onWybierz} onZamknij={() => setOtwarty(false)} />
    </div>
  );
}

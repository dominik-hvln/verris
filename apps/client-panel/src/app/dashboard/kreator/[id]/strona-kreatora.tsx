'use client';

import { useState } from 'react';
import type { StanKreatora, WidokStronyKreatora } from '@/lib/kreator';
import { Edytor } from '../edytor/edytor';
import { EkranGenerowania } from '../edytor/generowanie';
import { BrakDostepu } from '../brak-dostepu';

/** Strona w trakcie generowania (albo z błędem) → ekran postępu; gotowa → edytor. */
export function StronaKreatora({ widok, stan }: { widok: WidokStronyKreatora; stan: StanKreatora }) {
  const [biezacy, setBiezacy] = useState(widok);
  if (biezacy.status === 'GOTOWA' && biezacy.model) return <Edytor widok={biezacy} stan={stan} />;
  if (biezacy.status === 'GOTOWA') {
    return <BrakDostepu powod="Tej strony nie da się otworzyć w edytorze – zapisano ją w starszym formacie. Wygeneruj ją ponownie." />;
  }
  return <EkranGenerowania widok={biezacy} onGotowa={setBiezacy} />;
}

'use client';

import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { adresyZasobow } from './akcje';

/** Adresy bazowe plików zdjęć z biblioteki – raz na sesję edytora (podpisany adres nie wygasa). */
const pamiec = new Map<string, string>();

/** Paczka 122 – miniatura zdjęcia z biblioteki w polu obrazu formularza sekcji (adres z API, wariant 480 px). */
export function MiniaturaZasobu({ zasobId, alt }: { zasobId: string; alt: string }) {
  const [pobrany, setPobrany] = useState<{ id: string; adres: string | null } | null>(null);
  const adres = pamiec.get(zasobId) ?? (pobrany?.id === zasobId ? pobrany.adres : null);
  useEffect(() => {
    if (pamiec.has(zasobId)) return;
    let aktualny = true;
    void adresyZasobow([zasobId]).then((w) => {
      const a = w.ok ? w.dane.adresy[zasobId] : undefined;
      if (a) pamiec.set(zasobId, a);
      if (aktualny) setPobrany({ id: zasobId, adres: a ?? null });
    });
    return () => {
      aktualny = false;
    };
  }, [zasobId]);
  if (!adres) {
    return (
      <span className="flex h-16 w-24 flex-none items-center justify-center rounded-[6px] bg-raised" aria-hidden>
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- adres API (podpisany), bez optymalizacji Next
  return <img src={`${adres}480.webp`} alt={alt} className="h-16 w-24 flex-none rounded-[6px] bg-raised object-cover" />;
}

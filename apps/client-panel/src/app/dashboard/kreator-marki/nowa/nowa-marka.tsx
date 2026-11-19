'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BriefMarki } from '@verris/kreator/klient';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import { adresMarki, SCIEZKA_MARKI } from '@/lib/kreator-marki';
import { klasaPrzyciskuDrugiego } from '../../kreator/klasy';
import { nowaSeria, utworzMarke } from '../akcje';
import { FormularzBriefu, type WynikWyslania } from '../formularz-briefu';

/**
 * Brief → POST /kreator-marki/marki (szkic, limit marek) → POST …/serie (6 kierunków, limit serii) → ekran marki.
 * Gdy szkic powstał, a seria nie (np. chwilowy błąd AI) – i tak przechodzimy do marki: tam jest „Spróbuj ponownie”.
 */
export async function wyslijNowaMarke(brief: BriefMarki, przejdz: (adres: string) => void): Promise<WynikWyslania | null> {
  try {
    const m = await utworzMarke(brief);
    if (!m.ok) return { blad: m.blad, bledy: m.bledy, kod: m.kod };
    const s = await nowaSeria(m.dane.id);
    przejdz(s.ok ? adresMarki(m.dane.id, 'propozycje') : `${adresMarki(m.dane.id, 'brief')}&blad=seria`);
    return null;
  } catch {
    return { blad: KOMUNIKAT_PO_AKTUALIZACJI };
  }
}

export function NowaMarka({ blokada }: { blokada: string | null }) {
  const router = useRouter();
  return (
    <FormularzBriefu
      przycisk="Pokaż 6 propozycji"
      zablokowany={blokada}
      opisPrzycisku="Seria propozycji zużywa 1 z limitu serii. Zmiana koloru, kroju i układu później – bez limitu."
      onWyslij={(b) => wyslijNowaMarke(b, (a) => router.push(a))}
      dodatkoweAkcje={
        <Link href={SCIEZKA_MARKI} className={klasaPrzyciskuDrugiego}>
          Wróć
        </Link>
      }
    />
  );
}

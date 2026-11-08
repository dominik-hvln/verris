import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { opisCenyPro, type StanKreatora } from '@/lib/kreator';

/**
 * Paczka 121 – Kreator Pro w katalogu Dodatków. To abonament (odnowienia, faktura, anulowanie), nie jednorazowy
 * dodatek z portfela, więc kafelek prowadzi do zakupu na stronie kreatora zamiast kupować tutaj.
 * Bez dostępu do kreatora albo z istniejącym abonamentem – kafelka nie ma.
 */
export function KafelekKreatoraPro({ stan }: { stan: Pick<StanKreatora, 'dostep' | 'cenaPro' | 'pro'> | null }) {
  if (!stan?.dostep || !stan.pro || stan.pro.abonament) return null;
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <Sparkles className="h-4 w-4 text-amber-300" aria-hidden /> Verris Kreator Pro
        </h3>
        <p className="mt-1 text-sm text-neutral-400">
          Abonament do kreatora stron: 3 propozycje projektu, sekcje sklepu i bloga, pełne SEO i wyższe limity.
        </p>
        <p className="mt-2 text-sm text-neutral-300">{opisCenyPro(stan.cenaPro)}</p>
        {!stan.pro.zakup.mozliwy && stan.pro.zakup.powod ? <p className="mt-1 text-xs text-neutral-400">{stan.pro.zakup.powod}</p> : null}
      </div>
      <Link
        href="/dashboard/kreator#kreator-pro"
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black hover:bg-neutral-200 sm:mt-0"
      >
        Zobacz Kreator Pro
      </Link>
    </div>
  );
}

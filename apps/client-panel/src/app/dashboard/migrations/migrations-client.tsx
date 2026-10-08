'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PanelCard } from '@/components/panel';
import { MigrationWizard, type Zakres } from './migration-wizard';
import { MigracjaPoczty } from './migracja-poczty';
import { MigrationProgress } from './migration-progress';
import type { MigrationBundleSummary } from './types';

interface Props {
  serviceId: string;
  bundles: MigrationBundleSummary[];
  /** Wejście z zakładki Poczta (`?poczta=1`) — od razu formularz poczty. */
  tylkoPoczta?: boolean;
}

type Wybor = Zakres | 'poczta';

// Każdy rodzaj migracji to osobny formularz — wybór na początku (uwaga Dominika, t1 02.10).
const OPCJE: Array<{ id: Wybor; tytul: string; opis: string }> = [
  { id: 'strona', tytul: 'Cała strona', opis: 'Pliki i bazy danych razem — np. WordPress albo sklep.' },
  { id: 'pliki', tytul: 'Pliki', opis: 'Same pliki z serwera FTP/SFTP.' },
  { id: 'baza', tytul: 'Baza danych', opis: 'Jedna lub kilka baz MySQL.' },
  { id: 'poczta', tytul: 'Poczta', opis: 'Wiadomości i foldery jednej skrzynki (IMAP).' },
  {
    id: 'wszystko',
    tytul: 'Wszystko naraz',
    opis: 'Zaawansowane: pliki, bazy i skrzynki w jednej migracji — brakujące skrzynki założymy u nas.',
  },
];

export function MigrationsClient({ serviceId, bundles, tylkoPoczta = false }: Props) {
  const router = useRouter();
  const [wybor, setWybor] = useState<Wybor | null>(tylkoPoczta ? 'poczta' : null);

  return (
    <div className="space-y-6">
      <PanelCard className="space-y-4">
        <div>
          <h2 className="font-semibold text-white">Co przenosimy?</h2>
          <p className="text-xs text-neutral-500">
            Hasła szyfrujemy, używamy wyłącznie podczas transferu i usuwamy po zakończeniu.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Co przenosimy">
          {OPCJE.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={wybor === o.id}
              onClick={() => setWybor(o.id)}
              className={`rounded-2xl border p-4 text-left transition ${wybor === o.id ? 'border-cyan-400/60 bg-cyan-500/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-white/30'}`}
            >
              <p className="font-semibold text-white">{o.tytul}</p>
              <p className="mt-1 text-xs text-neutral-400">{o.opis}</p>
            </button>
          ))}
        </div>
      </PanelCard>

      {wybor ? (
        <PanelCard className="space-y-4">
          {/* key: zmiana rodzaju = świeży formularz, bez danych z poprzedniego */}
          {wybor === 'poczta' ? (
            <MigracjaPoczty key="poczta" serviceId={serviceId} onQueued={() => router.refresh()} />
          ) : (
            <MigrationWizard key={wybor} zakres={wybor} serviceId={serviceId} onQueued={() => router.refresh()} />
          )}
        </PanelCard>
      ) : null}

      {bundles.length > 0 ? (
        <PanelCard className="space-y-4">
          <h2 className="font-semibold text-white">Twoje migracje</h2>
          <div className="space-y-3">
            {bundles.map((bundle) => (
              <MigrationProgress key={bundle.id} serviceId={serviceId} initial={bundle} />
            ))}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}

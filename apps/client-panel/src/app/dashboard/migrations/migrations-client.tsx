'use client';

import { useRouter } from 'next/navigation';
import { PanelCard } from '@/components/panel';
import { MigrationWizard } from './migration-wizard';
import { MigrationProgress } from './migration-progress';
import type { MigrationBundleSummary } from './types';

interface Props {
  serviceId: string;
  bundles: MigrationBundleSummary[];
}

export function MigrationsClient({ serviceId, bundles }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PanelCard className="space-y-4">
        <div>
          <h2 className="font-semibold text-white">Przenieś stronę do nas (od A do Z)</h2>
          <p className="text-xs text-neutral-500">
            Pliki, bazy danych i pocztę przeniesiemy automatycznie. Hasła odczytujemy wyłącznie
            podczas transferu i zapisujemy zaszyfrowane w audycie.
          </p>
        </div>
        <MigrationWizard serviceId={serviceId} onQueued={() => router.refresh()} />
      </PanelCard>

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

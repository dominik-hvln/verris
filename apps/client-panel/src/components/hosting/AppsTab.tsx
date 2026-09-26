'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import WordpressTab from '@/components/hosting/WordpressTab';
import { WpOverviewPanel } from '@/components/hosting/WpOverviewPanel';
import { AppsClient } from '@/app/dashboard/apps/apps-client';
import { fetchAppsStatus, type AppsStatus } from '@/app/dashboard/apps/apps-actions';
import { SectionHead } from '@/components/panel/v2';
import { AplikacjeSelektorPanel } from '@/components/hosting/AplikacjeSelektorPanel';

/**
 * Zjednoczona zakładka „Aplikacje": WordPress 1-click (góra) + marketplace
 * pozostałych aplikacji (Nextcloud, PrestaShop, Joomla, MediaWiki — P-3/I-01) w jednym miejscu — koniec
 * dwóch osobnych widoków aplikacji.
 */
export default function AppsTab({ serviceId }: { serviceId: string }) {
  const [status, setStatus] = useState<AppsStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `loading` startuje jako true; serviceId pochodzi z trasy, więc jego zmiana to nowy montaż.
    void fetchAppsStatus(serviceId)
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [serviceId]);

  return (
    <div className="space-y-8">
      <WpOverviewPanel serviceId={serviceId} />
      <SectionHead title="Aplikacje 1-click" desc="Instalacja WordPressa i innych aplikacji na wybranej domenie — bez wgrywania plików." />
      <WordpressTab serviceId={serviceId} />

      <div>
        <h3 className="mb-3 font-display text-[15px] font-bold text-foreground">Pozostałe aplikacje</h3>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
          </div>
        ) : status ? (
          <AppsClient serviceId={serviceId} status={status} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nie udało się wczytać katalogu aplikacji.
          </p>
        )}
      </div>
      <AplikacjeSelektorPanel serviceId={serviceId} />
    </div>
  );
}

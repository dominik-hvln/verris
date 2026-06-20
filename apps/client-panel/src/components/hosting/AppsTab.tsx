'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import WordpressTab from '@/components/hosting/WordpressTab';
import { AppsClient } from '@/app/dashboard/apps/apps-client';
import { fetchAppsStatus, type AppsStatus } from '@/app/dashboard/apps/apps-actions';

/**
 * Zjednoczona zakładka „Aplikacje": WordPress 1-click (góra) + marketplace
 * pozostałych aplikacji (Nextcloud/PrestaShop, P-3) w jednym miejscu — koniec
 * dwóch osobnych widoków aplikacji.
 */
export default function AppsTab({ serviceId }: { serviceId: string }) {
  const [status, setStatus] = useState<AppsStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchAppsStatus(serviceId)
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [serviceId]);

  return (
    <div className="space-y-8">
      <WordpressTab serviceId={serviceId} />

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Pozostałe aplikacje
        </h3>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
          </div>
        ) : status ? (
          <AppsClient serviceId={serviceId} status={status} />
        ) : (
          <p className="py-6 text-center text-sm text-neutral-500">
            Nie udało się wczytać katalogu aplikacji.
          </p>
        )}
      </div>
    </div>
  );
}

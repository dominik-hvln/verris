'use client';

import { RedisPanel } from '@/components/hosting/RedisPanel';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchPhpStatus } from '@/app/dashboard/php/php-actions';
import { PhpClient } from '@/app/dashboard/php/php-client';
import { SectionHead } from '@/components/panel/v2';

type Status = Awaited<ReturnType<typeof fetchPhpStatus>>;

export default function PhpTab({ serviceId }: { serviceId: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `loading` startuje jako true; serviceId pochodzi z trasy, więc jego zmiana to nowy montaż.
    void fetchPhpStatus(serviceId)
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }
  if (!status) {
    return <p className="py-8 text-center text-sm text-neutral-400">Nie udało się wczytać ustawień PHP.</p>;
  }
  return (
    <div className="space-y-4">
      <SectionHead title="PHP i serwer" desc="Wersja PHP konta i ustawienia serwera. Wersję dla pojedynczej domeny zmienisz w widoku strony." />
      <PhpClient serviceId={serviceId} status={status} />
      <RedisPanel serviceId={serviceId} />
    </div>
  );
}

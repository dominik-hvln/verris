'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchPhpStatus } from '@/app/dashboard/php/php-actions';
import { PhpClient } from '@/app/dashboard/php/php-client';

type Status = Awaited<ReturnType<typeof fetchPhpStatus>>;

export default function PhpTab({ serviceId }: { serviceId: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
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
  return <PhpClient serviceId={serviceId} status={status} />;
}

'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { HostingFtpAccountDto } from '@verris/contracts';
import { fetchHostingFtpAction } from '@/app/dashboard/services/[id]/hosting-extra-actions';
import { FtpAccountsList } from '@/app/dashboard/ftp/ftp-accounts-list';

export default function FtpTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<HostingFtpAccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchHostingFtpAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać kont FTP.'))
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200/90">
        {error}
      </p>
    );
  }
  return <FtpAccountsList rows={rows} />;
}

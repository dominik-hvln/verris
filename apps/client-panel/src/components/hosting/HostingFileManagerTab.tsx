'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDaLinksAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';

export default function HostingFileManagerTab({ serviceId }: { serviceId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchHostingDaLinksAction(serviceId)
      .then((links) => {
        if (!cancel) setUrl(links.fileManagerUrl || null);
      })
      .catch(() => {
        if (!cancel) setUrl(null);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [serviceId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
      <p className="text-sm text-neutral-400 max-w-2xl">
        Lista katalogów i edycja plików odbywa się w menedżerze plików panelu hostingu (pełny dostęp do konta
        hostingowego).
      </p>
      {url ? (
        <Button asChild className="bg-white text-black hover:bg-neutral-200 gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <FolderOpen className="h-4 w-4" />
            Otwórz menedżer plików
            <ExternalLink className="h-4 w-4 opacity-70" />
          </a>
        </Button>
      ) : (
        <p className="text-sm text-amber-200">Brak linku do menedżera plików — upewnij się, że konto hostingowe jest provisionowane.</p>
      )}
    </div>
  );
}

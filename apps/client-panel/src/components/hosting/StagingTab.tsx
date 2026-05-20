'use client';

import { useEffect, useState } from 'react';
import { Box, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDaLinksAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';

interface StagingTabProps {
  serviceId: string;
}

/**
 * Klonowanie / staging realizuje się po stronie DirectAdmin (subdomeny, dodatkowe domeny, kopie plików).
 */
export default function StagingTab({ serviceId }: StagingTabProps) {
  const [stagingUrl, setStagingUrl] = useState<string | null>(null);
  const [panelUrl, setPanelUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchHostingDaLinksAction(serviceId)
      .then((l) => {
        if (!cancel) {
          setStagingUrl(l.stagingHint || null);
          setPanelUrl(l.panelBaseUrl || null);
        }
      })
      .catch(() => {
        if (!cancel) {
          setStagingUrl(null);
          setPanelUrl(null);
        }
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3 mb-3">
          <Box className="w-7 h-7" />
          Środowisko stagingowe
        </h2>
        <p className="text-neutral-400 text-sm leading-relaxed max-w-2xl mb-6">
          Osobne środowisko testowe tworzysz w panelu hostingu: subdomena (np. <code className="text-neutral-300">staging.</code>),
          katalog dokumentów i ewentualnie kopia bazy przez narzędzia panelu lub SSH. Ten panel nie uruchamia klonów
          jednym przyciskiem — unikamy pozornych akcji bez realizacji po stronie serwera.
        </p>
        <div className="flex flex-wrap gap-3">
          {stagingUrl ? (
            <Button asChild className="bg-white text-black hover:bg-neutral-200 gap-2">
              <a href={stagingUrl} target="_blank" rel="noopener noreferrer">
                Zarządzanie domeną w panelu
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
          {panelUrl ? (
            <Button asChild variant="outline" className="border-white/20 text-white gap-2">
              <a href={panelUrl} target="_blank" rel="noopener noreferrer">
                Panel hostingu
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <p className="text-sm text-amber-200">Brak linków do panelu hostingu.</p>
          )}
        </div>
      </div>
    </div>
  );
}

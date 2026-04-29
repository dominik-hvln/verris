'use client';

import { useEffect, useState } from 'react';
import { Key, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@ekohost/ui';
import { fetchHostingDaLinksAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';

interface MagicLoginTabProps {
  serviceId: string;
}

/**
 * „Magic login” do aplikacji (WordPress itd.) nie jest zaimplementowany w API — użytkownik loguje się przez DA lub panel aplikacji.
 */
export default function MagicLoginTab({ serviceId }: MagicLoginTabProps) {
  const [panelUrl, setPanelUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchHostingDaLinksAction(serviceId)
      .then((l) => {
        if (!cancel) setPanelUrl(l.panelBaseUrl || null);
      })
      .catch(() => {
        if (!cancel) setPanelUrl(null);
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
          <Key className="w-7 h-7" />
          Logowanie do aplikacji
        </h2>
        <p className="text-neutral-400 text-sm leading-relaxed max-w-2xl mb-6">
          Jednorazowe tokeny SSO do WordPressa lub innych aplikacji nie są obecnie wystawiane przez EkoHost. Zaloguj się
          hasłem aplikacji, menedżerem haseł lub — gdy dostawca oferuje integrację — przez DirectAdmin / instalator
          aplikacji (np. Softaculous).
        </p>
        {panelUrl ? (
          <Button asChild className="bg-white text-black hover:bg-neutral-200 gap-2">
            <a href={panelUrl} target="_blank" rel="noopener noreferrer">
              Otwórz DirectAdmin
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <p className="text-sm text-amber-200">Brak adresu panelu DirectAdmin.</p>
        )}
      </div>
    </div>
  );
}

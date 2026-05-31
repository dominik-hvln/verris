'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, RefreshCw, AlertCircle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import DomainPointingPanel from '@/components/hosting/DomainPointingPanel';

interface Props {
  serviceId: string;
}

export default function DomainsTab({ serviceId }: Props) {
  const { links } = useHostingLinks();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<{ name: string }[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [primaryDomain, setPrimaryDomain] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchHostingDomainsAction(serviceId);
      setDomains(res.domains);
      setFetchError(res.fetchError);
      setPrimaryDomain(res.primaryDomain);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać domen.');
      setDomains([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie domen…
      </div>
    );
  }

  return (
    <HostingTabShell
      title="Domeny na koncie"
      description="Lista domen przypisanych do usługi."
      icon={<Globe className="h-4 w-4" />}
      actions={
        <>
          {links.domainsUrl ? (
            <DaExternalLink href={links.domainsUrl}>
              Zarządzaj domenami
              <ExternalLink className="h-3 w-3 opacity-70" />
            </DaExternalLink>
          ) : null}
          {links.dnsUrl ? (
            <DaExternalLink href={links.dnsUrl}>
              Strefa DNS
              <ExternalLink className="h-3 w-3 opacity-70" />
            </DaExternalLink>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            className="h-8 gap-1.5 border-white/15 bg-white/[0.04] text-white hover:bg-white/10 text-xs"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}

      <DomainPointingPanel serviceId={serviceId} dnsManageUrl={links.dnsUrl} variant="full" />

      <div className="rounded-xl border border-white/5 bg-[#050505] overflow-hidden mt-4">
        <table className="w-full text-xs sm:text-sm table-fixed">
          <thead className="bg-white/5 border-b border-white/5 text-left">
            <tr>
              <th className="py-3 px-3 text-neutral-300 font-semibold w-[45%]">Domena</th>
              <th className="py-3 px-2 text-neutral-300 font-semibold hidden sm:table-cell">Rola</th>
              <th className="py-3 px-2 text-neutral-300 font-semibold text-right w-[88px]">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {domains.length === 0 && !fetchError ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-neutral-500 text-xs">
                  Brak domen — dodaj je w panelu hostingu.
                </td>
              </tr>
            ) : null}
            {domains.map((d) => {
              const primary =
                primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
              const dnsLink = links.dnsUrl && primary ? links.dnsUrl : null;
              return (
                <tr key={d.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 px-3 text-white font-medium truncate" title={d.name}>
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{d.name}</span>
                    </div>
                    {primary ? (
                      <span className="sm:hidden mt-1 inline-block text-[10px] text-cyan-300">Główna</span>
                    ) : null}
                  </td>
                  <td className="py-3 px-2 hidden sm:table-cell">
                    {primary ? (
                      <span className="text-[10px] bg-cyan-500/15 text-cyan-200 px-2 py-0.5 rounded border border-cyan-500/30">
                        Główna
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-500">Dodatkowa</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {dnsLink ? (
                      <a
                        href={dnsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] sm:text-xs text-neutral-300 hover:text-white whitespace-nowrap"
                      >
                        DNS →
                      </a>
                    ) : (
                      <span className="text-neutral-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </HostingTabShell>
  );
}

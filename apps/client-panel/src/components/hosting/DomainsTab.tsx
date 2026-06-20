'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, RefreshCw, AlertCircle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import DomainPointingPanel from '@/components/hosting/DomainPointingPanel';
import SubdomainsManager from '@/components/hosting/SubdomainsManager';
import { ResponsiveDataView } from '@/components/panel';

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

      <div className="mt-4">
        <SubdomainsManager serviceId={serviceId} />
      </div>

      <div className="mt-4 min-w-0">
        {domains.length === 0 && !fetchError ? (
          <p className="rounded-xl border border-white/5 bg-[#050505] px-3 py-8 text-center text-xs text-neutral-500">
            Brak domen — dodaj je w panelu hostingu.
          </p>
        ) : (
          <ResponsiveDataView
            rows={domains}
            rowKey={(d) => d.name}
            tableClassName="rounded-xl border border-white/5 bg-[#050505]"
            columns={[
              {
                key: 'name',
                header: 'Domena',
                cell: (d) => {
                  const primary =
                    primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
                  return (
                    <div className="flex min-w-0 items-center gap-2 font-medium text-white">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span className="truncate" title={d.name}>
                        {d.name}
                      </span>
                      {primary ? (
                        <span className="shrink-0 rounded border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-200">
                          Główna
                        </span>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                key: 'role',
                header: 'Rola',
                cell: (d) => {
                  const primary =
                    primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
                  return primary ? (
                    <span className="text-[10px] text-cyan-200">Główna</span>
                  ) : (
                    <span className="text-[10px] text-neutral-500">Dodatkowa</span>
                  );
                },
              },
              {
                key: 'actions',
                header: 'Akcje',
                headerClassName: 'text-right',
                cellClassName: 'text-right',
                cell: (d) => {
                  const primary =
                    primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
                  const dnsLink = links.dnsUrl && primary ? links.dnsUrl : null;
                  return dnsLink ? (
                    <a
                      href={dnsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-300 hover:text-white"
                    >
                      DNS →
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-600">—</span>
                  );
                },
              },
            ]}
            renderMobileCard={(d) => {
              const primary =
                primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
              const dnsLink = links.dnsUrl && primary ? links.dnsUrl : null;
              return (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-[#050505] p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span className="break-all text-sm font-medium text-white">{d.name}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {primary ? 'Domena główna' : 'Dodatkowa'}
                    </p>
                  </div>
                  {dnsLink ? (
                    <a
                      href={dnsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs font-medium text-neutral-300 hover:text-white"
                    >
                      DNS →
                    </a>
                  ) : null}
                </div>
              );
            }}
          />
        )}
      </div>
    </HostingTabShell>
  );
}

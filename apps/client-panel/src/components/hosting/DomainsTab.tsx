'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { Globe, RefreshCw, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import DomainPointingPanel from '@/components/hosting/DomainPointingPanel';
import SubdomainsManager from '@/components/hosting/SubdomainsManager';
import AdditionalDomains from '@/components/hosting/AdditionalDomains';
import DnsZoneSection from '@/components/hosting/DnsZoneSection';
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

  // Samo pobranie — przy montażu `error` jest już pusty, więc efekt nie musi go zerować.
  const fetchDomains = useCallback(
    () =>
      fetchHostingDomainsAction(serviceId)
        .then((res) => {
          setDomains(res.domains);
          setFetchError(res.fetchError);
          setPrimaryDomain(res.primaryDomain);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Nie udało się pobrać domen.');
          setDomains([]);
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        }),
    [serviceId],
  );

  const load = useCallback(() => {
    setError(null);
    return fetchDomains();
  }, [fetchDomains]);

  useEffect(() => {
    void fetchDomains();
  }, [fetchDomains]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie domen…
      </div>
    );
  }

  return (
    <HostingTabShell
      title="Domeny i DNS"
      description="Każda domena ma własny widok strony: DNS, SSL, pliki, poczta i PHP."
      icon={<Globe className="h-4 w-4" />}
      help={{
        blurb:
          'Aby domena działała na hostingu, trzeba ją „skierować" (nameservery lub rekord A). Pokażemy dokładnie co ustawić u rejestratora i sprawdzimy, czy już działa.',
        kbQuery: 'skierować domenę',
      }}
      actions={
        <>
          {links.domainsUrl ? (
            <DaExternalLink href={links.domainsUrl}>
              Zarządzaj domenami
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
            className="h-8 gap-1.5 border-line-strong bg-raised text-foreground hover:bg-raised text-xs"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-crit/30 bg-crit/12 px-3 py-2 text-xs text-crit">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}

      <DomainPointingPanel serviceId={serviceId} variant="full" />

      <div className="mt-4">
        <SubdomainsManager serviceId={serviceId} />
      </div>

      <div className="mt-4 min-w-0">
        {domains.length === 0 && !fetchError ? (
          <p className="rounded-[10px] border border-line bg-card px-3 py-8 text-center text-xs text-muted-foreground">
            Brak domen — dodaj je w panelu hostingu.
          </p>
        ) : (
          <ResponsiveDataView
            rows={domains}
            rowKey={(d) => d.name}
            tableClassName="rounded-[10px] border border-line bg-card"
            columns={[
              {
                key: 'name',
                header: 'Domena',
                cell: (d) => {
                  return (
                    <Link href={`/dashboard/services/${serviceId}/sites/${encodeURIComponent(d.name)}`} className="flex min-w-0 items-center gap-2 font-semibold text-foreground hover:text-primary">
                      <span className="v2-breathe h-[7px] w-[7px] shrink-0 rounded-full bg-data" />
                      <span className="break-words" title={d.name}>
                        {d.name}
                      </span>
                    </Link>
                  );
                },
              },
              {
                key: 'role',
                header: 'Rola',
                cell: (d) => {
                  const primary =
                    primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
                  return <span className="text-[13px] text-muted-foreground">{primary ? 'domena główna' : 'domena dodatkowa'}</span>;
                },
              },
              {
                key: 'actions',
                header: 'Akcje',
                headerClassName: 'text-right',
                cellClassName: 'text-right',
                cell: (d) => (
                  <Link href={`/dashboard/services/${serviceId}/sites/${encodeURIComponent(d.name)}`} className="text-[13px] text-muted-foreground hover:text-primary">
                    Otwórz stronę →
                  </Link>
                ),
              },
            ]}
            renderMobileCard={(d) => {
              const primary =
                primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
              return (
                <Link
                  href={`/dashboard/services/${serviceId}/sites/${encodeURIComponent(d.name)}`}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-card px-4 py-3"
                >
                  <span className="min-w-0">
                    <b className="block break-all text-sm font-semibold text-foreground">{d.name}</b>
                    <small className="text-[12.5px] text-muted-foreground">{primary ? 'domena główna' : 'domena dodatkowa'}</small>
                  </span>
                  <span className="shrink-0 text-muted-foreground">→</span>
                </Link>
              );
            }}
          />
        )}
      </div>
      <AdditionalDomains serviceId={serviceId} />
      {domains.length > 0 ? (
        <DnsZoneSection serviceId={serviceId} domains={domains} primaryDomain={primaryDomain} />
      ) : null}
    </HostingTabShell>
  );
}

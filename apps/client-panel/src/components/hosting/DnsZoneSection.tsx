'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { HostingDnsRecordDto } from '@verris/contracts';
import { DnsManager } from '@/app/dashboard/dns/dns-manager';
import { fetchHostingDnsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { Select } from '@/components/panel';

/**
 * F-01/F-02 — edytor strefy DNS w zakładce „Domeny". Komponent DnsManager
 * istniał od sierpnia i nie był nigdzie wyrenderowany: klient trafiał do
 * strefy wyłącznie przez link do DirectAdmina.
 */
export default function DnsZoneSection({
  serviceId,
  domains,
  primaryDomain,
}: {
  serviceId: string;
  domains: { name: string }[];
  primaryDomain: string | null;
}) {
  const [domain, setDomain] = useState<string | null>(primaryDomain ?? domains[0]?.name ?? null);
  const [records, setRecords] = useState<HostingDnsRecordDto[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Strefa wybranej domeny ładuje się od razu po montażu.
  const [loading, setLoading] = useState(domain !== null);

  // Samo pobranie; spinner włączają montaż (stan początkowy), zmiana domeny i `load`.
  const fetchZone = useCallback(
    (d: string) =>
      fetchHostingDnsAction(serviceId, d)
        .then((res) => {
          setRecords(res.records);
          setFetchError(res.fetchError);
        })
        .catch((e) => {
          setRecords([]);
          setFetchError(e instanceof Error ? e.message : 'Nie udało się pobrać strefy DNS.');
        })
        .finally(() => {
          setLoading(false);
        }),
    [serviceId],
  );

  const load = useCallback(async () => {
    if (!domain) return;
    setLoading(true);
    await fetchZone(domain);
  }, [domain, fetchZone]);

  useEffect(() => {
    if (domain) void fetchZone(domain);
  }, [domain, fetchZone]);

  if (!domain) return null;

  return (
    <section className="mt-6 min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Strefa DNS</h3>
        {domains.length > 1 ? (
          <Select
            aria-label="Domena strefy DNS"
            value={domain}
            onChange={(d: string) => {
              if (d !== domain) setLoading(true);
              setDomain(d);
            }}
            options={domains.map((d) => ({ value: d.name, label: d.name }))}
            className="h-8 text-xs"
          />
        ) : (
          <span className="text-xs text-neutral-400">{domain}</span>
        )}
      </div>
      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}
      {loading && records.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-xs text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie strefy DNS…
        </div>
      ) : (
        <DnsManager serviceId={serviceId} domain={domain} records={records} onChanged={() => void load()} />
      )}
    </section>
  );
}

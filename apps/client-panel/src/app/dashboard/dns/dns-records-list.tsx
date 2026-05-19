import type { HostingDnsRecordDto } from '@verris/contracts';
import { AlertCircle } from 'lucide-react';
import { PanelEmptyState, ResponsiveDataView } from '@/components/panel';

export function DnsRecordsList({ records }: { records: HostingDnsRecordDto[] }) {
  return (
    <ResponsiveDataView
      rows={records}
      rowKey={(r) => r.id}
      columns={[
        {
          key: 'name',
          header: 'Host',
          cell: (r) => <span className="text-white">{r.name}</span>,
        },
        {
          key: 'type',
          header: 'Typ',
          cell: (r) => <span className="text-neutral-300">{r.type}</span>,
        },
        {
          key: 'value',
          header: 'Wartość',
          cell: (r) => <span className="text-neutral-300 break-all">{r.value}</span>,
        },
        {
          key: 'ttl',
          header: 'TTL',
          cellClassName: 'pr-0',
          cell: (r) => <span className="text-neutral-300">{r.ttl ?? '—'}</span>,
        },
      ]}
      renderMobileCard={(record) => (
        <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="font-mono text-sm font-semibold text-white break-all">{record.name}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-neutral-500">Typ</dt>
            <dd className="text-neutral-200">{record.type}</dd>
            <dt className="text-neutral-500">TTL</dt>
            <dd className="text-neutral-200">{record.ttl ?? '—'}</dd>
          </dl>
          <p className="mt-3 text-sm text-neutral-300 break-all">{record.value}</p>
        </article>
      )}
      empty={
        <PanelEmptyState
          icon={AlertCircle}
          title="Brak rekordów DNS"
          description="Dla tej domeny nie znaleziono rekordów w strefie."
        />
      }
    />
  );
}

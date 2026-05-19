import type { HostingFtpAccountDto } from '@verris/contracts';
import { FolderKanban } from 'lucide-react';
import { PanelEmptyState, ResponsiveDataView } from '@/components/panel';

export function FtpAccountsList({ rows }: { rows: HostingFtpAccountDto[] }) {
  return (
    <ResponsiveDataView
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        {
          key: 'username',
          header: 'Użytkownik',
          cell: (r) => <span className="text-white font-medium">{r.username}</span>,
        },
        {
          key: 'path',
          header: 'Katalog',
          cell: (r) => <span className="text-neutral-300 font-mono text-xs">{r.path}</span>,
        },
        {
          key: 'status',
          header: 'Status',
          cellClassName: 'pr-0',
          cell: (r) => (
            <span className={r.suspended ? 'text-amber-300' : 'text-emerald-300'}>
              {r.suspended ? 'Zawieszone' : 'Aktywne'}
            </span>
          ),
        },
      ]}
      renderMobileCard={(row) => (
        <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="font-semibold text-white">{row.username}</p>
          <p className="mt-2 font-mono text-xs text-neutral-400 break-all">{row.path}</p>
          <p
            className={`mt-3 text-xs font-medium ${row.suspended ? 'text-amber-300' : 'text-emerald-300'}`}
          >
            {row.suspended ? 'Zawieszone' : 'Aktywne'}
          </p>
        </article>
      )}
      empty={
        <PanelEmptyState
          icon={FolderKanban}
          title="Brak kont FTP"
          description="Na tym koncie hostingowym nie ma jeszcze dodatkowych użytkowników FTP."
        />
      }
    />
  );
}

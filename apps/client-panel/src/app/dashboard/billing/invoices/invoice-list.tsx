import Link from 'next/link';
import { Download } from 'lucide-react';
import type { InvoiceDto, InvoiceStatus } from '@verris/contracts';
import { PanelEmptyState, ResponsiveDataView } from '@/components/panel';
import { FileText } from 'lucide-react';

const statusLabels: Record<InvoiceStatus, string> = {
  DRAFT: 'Wersja robocza',
  OPEN: 'Do zapłaty',
  PAID: 'Opłacona',
  VOID: 'Anulowana',
  UNCOLLECTIBLE: 'Nieściągalna',
};

const statusTones: Record<InvoiceStatus, string> = {
  DRAFT: 'border-neutral-400/30 bg-neutral-400/5 text-neutral-200',
  OPEN: 'border-amber-400/30 bg-amber-400/5 text-amber-200',
  PAID: 'border-emerald-400/30 bg-emerald-400/5 text-emerald-200',
  VOID: 'border-neutral-500/30 bg-neutral-500/5 text-neutral-400',
  UNCOLLECTIBLE: 'border-rose-400/30 bg-rose-400/5 text-rose-200',
};

function formatDate(invoice: InvoiceDto) {
  const issued = invoice.issuedAt ?? invoice.createdAt;
  return new Date(issued).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function InvoiceDownload({ invoice }: { invoice: InvoiceDto }) {
  if (invoice.hostedUrl) {
    return (
      <a
        href={invoice.hostedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-neutral-100 hover:border-white/30 hover:bg-white/[0.1]"
      >
        <Download className="h-3.5 w-3.5" />
        Pobierz
      </a>
    );
  }
  if (invoice.pdfUrl) {
    return (
      <a
        href={invoice.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-neutral-100 hover:border-white/30 hover:bg-white/[0.1]"
      >
        <Download className="h-3.5 w-3.5" />
        PDF
      </a>
    );
  }
  return <span className="text-xs text-neutral-500">—</span>;
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const label = statusLabels[status] ?? status;
  const tone = statusTones[status] ?? statusTones.DRAFT;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export function InvoiceList({ rows }: { rows: InvoiceDto[] }) {
  return (
    <ResponsiveDataView
      rows={rows}
      rowKey={(inv) => inv.id}
      tableClassName="rounded-3xl border border-white/5 bg-neutral-900/40"
      columns={[
        {
          key: 'date',
          header: 'Data',
          cell: (inv) => <span className="whitespace-nowrap text-neutral-200">{formatDate(inv)}</span>,
        },
        {
          key: 'number',
          header: 'Numer',
          cell: (inv) => <span className="break-all font-mono text-neutral-100">{inv.number}</span>,
        },
        {
          key: 'amount',
          header: 'Kwota',
          headerClassName: 'text-right',
          cellClassName: 'text-right',
          cell: (inv) => (
            <span className="whitespace-nowrap font-semibold tabular-nums text-white">
              {inv.amount} {inv.currency}
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (inv) => <StatusBadge status={inv.status} />,
        },
        {
          key: 'download',
          header: 'Pobierz',
          headerClassName: 'text-right',
          cellClassName: 'text-right pr-0',
          cell: (inv) => <InvoiceDownload invoice={inv} />,
        },
      ]}
      renderMobileCard={(inv) => (
        <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">{formatDate(inv)}</p>
              <p className="mt-1 break-all font-mono text-sm font-medium text-white">{inv.number}</p>
            </div>
            <StatusBadge status={inv.status} />
          </div>
          <p className="mt-3 text-lg font-semibold tabular-nums text-white">
            {inv.amount} {inv.currency}
          </p>
          <div className="mt-4">
            <InvoiceDownload invoice={inv} />
          </div>
        </article>
      )}
      empty={
        <PanelEmptyState
          icon={FileText}
          title="Brak faktur"
          description="Faktury pojawią się po pierwszej opłacie kartą za usługę cykliczną. Doładowania portfela potwierdza e-mail od Stripe."
          action={
            <Link href="/dashboard/billing" className="text-sm text-indigo-400 hover:underline">
              Wróć do portfela
            </Link>
          }
        />
      }
    />
  );
}

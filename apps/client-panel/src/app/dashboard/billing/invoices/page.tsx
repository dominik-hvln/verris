import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, ShieldAlert } from 'lucide-react';
import type { InvoiceDto, InvoiceListResponse, InvoiceStatus } from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { getInvoiceList } from './data';

const PAGE_SIZE = 25;

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

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let data: InvoiceListResponse | null = null;
  let loadError: string | null = null;
  try {
    data = await getInvoiceList({ limit: PAGE_SIZE, offset });
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Nie udało się pobrać listy faktur (${err.status}).`
        : err instanceof Error
          ? err.message
          : 'Nieznany błąd';
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const hasPrev = page > 1;
  const hasNext = data ? page < totalPages : false;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Wróć do portfela
          </Link>
          <h1 className="mt-3 text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400">
            Faktury
          </h1>
          <p className="text-neutral-400 mt-2 text-lg">
            Wszystkie faktury z subskrypcji opłacanych kartą — pobierzesz je z hostowanej strony Stripe.
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-5 flex items-start gap-3 text-rose-200">
          <ShieldAlert className="h-5 w-5 mt-0.5" />
          <div>
            <div className="font-semibold">Wystąpił problem</div>
            <p className="text-sm opacity-90 mt-1">{loadError}</p>
          </div>
        </div>
      ) : data ? (
        <>
          {data.rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-hidden rounded-3xl border border-white/5 bg-neutral-900/40">
              <table className="min-w-full divide-y divide-white/5 text-sm">
                <thead className="bg-white/[0.02] text-xs uppercase tracking-widest text-neutral-500">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Data</th>
                    <th className="px-6 py-4 text-left font-semibold">Numer</th>
                    <th className="px-6 py-4 text-right font-semibold">Kwota</th>
                    <th className="px-6 py-4 text-left font-semibold">Status</th>
                    <th className="px-6 py-4 text-right font-semibold">Pobierz</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.rows.map((invoice) => (
                    <InvoiceRow key={invoice.id} invoice={invoice} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            hasPrev={hasPrev}
            hasNext={hasNext}
            total={data.total}
          />
        </>
      ) : null}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: InvoiceDto }) {
  const issued = invoice.issuedAt ?? invoice.createdAt;
  const dateLabel = new Date(issued).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const statusLabel = statusLabels[invoice.status] ?? invoice.status;
  const statusTone = statusTones[invoice.status] ?? statusTones.DRAFT;

  return (
    <tr className="hover:bg-white/[0.03] transition-colors">
      <td className="px-6 py-4 text-neutral-200 whitespace-nowrap">{dateLabel}</td>
      <td className="px-6 py-4 font-mono text-neutral-100 break-all">{invoice.number}</td>
      <td className="px-6 py-4 text-right tabular-nums text-white font-semibold whitespace-nowrap">
        {invoice.amount} {invoice.currency}
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        {invoice.hostedUrl ? (
          <a
            href={invoice.hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-neutral-100 hover:bg-white/[0.1] hover:border-white/30 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Pobierz
          </a>
        ) : invoice.pdfUrl ? (
          <a
            href={invoice.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-neutral-100 hover:bg-white/[0.1] hover:border-white/30 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </a>
        ) : (
          <span className="text-xs text-neutral-500">—</span>
        )}
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center">
      <FileText className="h-10 w-10 mx-auto text-neutral-500" />
      <h3 className="mt-4 text-xl font-bold text-white">Brak faktur</h3>
      <p className="mt-2 text-neutral-400 max-w-md mx-auto">
        Faktury pojawiają się tutaj, gdy Stripe pobierze pierwszą opłatę z karty (subskrypcja
        cykliczna). Dla doładowań portfela potwierdzeniem jest e-mail od Stripe.
      </p>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  hasPrev,
  hasNext,
  total,
}: {
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4">
      <p className="text-sm text-neutral-400">
        Strona {page} z {totalPages} • {total} {total === 1 ? 'faktura' : 'faktur'} łącznie
      </p>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link
            href={`/dashboard/billing/invoices?page=${page - 1}`}
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.08] hover:border-white/30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Poprzednia
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm text-neutral-600 cursor-not-allowed">
            <ChevronLeft className="h-4 w-4" /> Poprzednia
          </span>
        )}
        {hasNext ? (
          <Link
            href={`/dashboard/billing/invoices?page=${page + 1}`}
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.08] hover:border-white/30 transition-colors"
          >
            Następna <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm text-neutral-600 cursor-not-allowed">
            Następna <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );
}

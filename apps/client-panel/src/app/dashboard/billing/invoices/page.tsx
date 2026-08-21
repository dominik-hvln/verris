import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import type { InvoiceListResponse } from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { PageHeaderRow, PanelCard } from '@/components/panel';
import { getInvoiceList } from './data';
import { InvoiceList } from './invoice-list';

const PAGE_SIZE = 25;

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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Wróć do portfela
      </Link>

      <PageHeaderRow
        title="Faktury"
        description="Faktury z opłat kartą za usługi cykliczne — pobierzesz je ze strony Stripe."
      />

      {loadError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/5 p-5 text-rose-200">
          <ShieldAlert className="mt-0.5 h-5 w-5" />
          <div>
            <div className="font-semibold">Wystąpił problem</div>
            <p className="mt-1 text-sm opacity-90">{loadError}</p>
          </div>
        </div>
      ) : data ? (
        <>
          <PanelCard className="p-0 md:p-0 overflow-hidden">
            <InvoiceList rows={data.rows} />
          </PanelCard>
          {data.rows.length > 0 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              hasPrev={hasPrev}
              hasNext={hasNext}
              total={data.total}
            />
          ) : null}
        </>
      ) : null}
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
    <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-neutral-400">
        Strona {page} z {totalPages} • {total} {total === 1 ? 'faktura' : 'faktur'} łącznie
      </p>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link
            href={`/dashboard/billing/invoices?page=${page - 1}`}
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-white/30 hover:bg-white/[0.08]"
          >
            <ChevronLeft className="h-4 w-4" /> Poprzednia
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm text-neutral-600">
            <ChevronLeft className="h-4 w-4" /> Poprzednia
          </span>
        )}
        {hasNext ? (
          <Link
            href={`/dashboard/billing/invoices?page=${page + 1}`}
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-white/30 hover:bg-white/[0.08]"
          >
            Następna <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm text-neutral-600">
            Następna <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );
}

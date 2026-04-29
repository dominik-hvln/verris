import type { InvoiceListResponse } from '@ekohost/contracts';
import { apiFetch } from '@/lib/api';

export async function getInvoiceList(opts: {
  limit?: number;
  offset?: number;
} = {}): Promise<InvoiceListResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return apiFetch<InvoiceListResponse>(
    qs ? `/billing/invoices?${qs}` : '/billing/invoices',
  );
}

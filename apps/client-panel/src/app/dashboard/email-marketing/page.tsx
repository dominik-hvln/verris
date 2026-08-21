import Link from 'next/link';
import { Megaphone, ArrowRight, Plus } from 'lucide-react';
import type { ServiceSummaryDto } from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { PageHeaderRow } from '@/components/panel';
import { listServices } from '../services/data';

export const dynamic = 'force-dynamic';

export default async function EmailMarketingIndexPage() {
  let services: ServiceSummaryDto[] = [];
  let error: string | null = null;
  try {
    services = await listServices();
  } catch (err) {
    error = err instanceof ApiError ? `Nie udało się pobrać usług (${err.status}).` : 'Nieznany błąd';
  }

  const emm = services.filter((s) => s.productKind === 'EMAIL_MARKETING');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeaderRow
        icon={<Megaphone className="h-6 w-6 text-fuchsia-300" />}
        title="Email marketing"
        description="Twórz listy subskrybentów, importuj kontakty i wysyłaj newslettery z pełną zgodnością RODO (double opt-in, wypis jednym kliknięciem)."
      />

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : emm.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-fuchsia-300/70" />
          <h2 className="mt-4 text-lg font-semibold text-white">Nie masz jeszcze usługi email-marketingu</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
            Wykup plan email-marketingu, aby wysyłać newslettery do własnej bazy subskrybentów — z hostingu Verris,
            z dbałością o dostarczalność i zgodność RODO.
          </p>
          <Link
            href="/dashboard/services/new"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500"
          >
            <Plus className="h-4 w-4" /> Zamów usługę
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {emm.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/email-marketing/${s.id}`}
              className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-400/[0.04]"
            >
              <div>
                <p className="text-sm font-semibold text-white">{s.planName ?? 'Email marketing'}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {s.status === 'ACTIVE' ? 'Aktywna' : s.status} · handle: {s.serviceTag ?? '—'}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-neutral-500 transition group-hover:translate-x-1 group-hover:text-fuchsia-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

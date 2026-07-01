import { BarChart3 } from 'lucide-react';
import type { ServiceSummaryDto } from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { PageHeaderRow } from '@/components/panel';
import { listServices } from '../services/data';
import { AnalyticsClient } from './analytics-client';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  let services: ServiceSummaryDto[] = [];
  let error: string | null = null;
  try {
    services = await listServices();
  } catch (err) {
    error = err instanceof ApiError ? `Nie udało się pobrać usług (${err.status}).` : 'Nieznany błąd';
  }

  // Analityka dotyczy usług hostingowych (strony WWW).
  const hosting = services
    .filter((s) => s.productKind === 'HOSTING' && s.status === 'ACTIVE')
    .map((s) => ({ id: s.id, name: s.planName, domain: s.account?.domain ?? null }));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeaderRow
        icon={<BarChart3 className="h-6 w-6 text-cyan-300" />}
        title="Analityka stron"
        description="Prywatna analityka odwiedzin bez cookies i bez danych osobowych — zgodna z RODO, bez bannera zgód. Wklej jeden lekki snippet i śledź ruch."
      />
      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : (
        <AnalyticsClient services={hosting} />
      )}
    </div>
  );
}

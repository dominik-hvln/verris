import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRightLeft } from 'lucide-react';
import type { PlanChangePreviewDto, ServiceDetailsDto } from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { getServiceDetails, listPublicPlans } from '../../data';
import { PlanChangeForm } from './form';
import { previewPlanChangeAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function PlanChangePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let service: ServiceDetailsDto | null = null;
  let loadError: string | null = null;
  try {
    service = await getServiceDetails(id);
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Nie udało się wczytać usługi.';
  }

  const publicPlans = await listPublicPlans().catch(() => []);
  const targetPlans = service
    ? publicPlans
        .filter((p) => p.id !== service.plan.id)
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          cpuLimit: p.cpuLimit,
          ramLimitMb: p.ramLimitMb,
          diskLimitMb: p.diskLimitMb,
          priceForInterval:
            service.interval === 'YEAR' ? p.priceYearly : p.priceMonthly,
          currency: p.currency,
        }))
    : [];

  let initialPreview: PlanChangePreviewDto | null = null;
  if (service && targetPlans[0]) {
    const res = await previewPlanChangeAction(id, targetPlans[0].id);
    if (res.ok) initialPreview = res.data;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/services"
          className="p-3 border border-white/5 rounded-2xl bg-[#0a0a0a] hover:bg-[#121212] transition-colors text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white flex items-center gap-3">
            <ArrowRightLeft className="w-8 h-8 text-sky-400" />
            Zmiana planu
          </h1>
          {service && (
            <p className="text-neutral-400 mt-2 text-md">
              {service.account?.domain ? (
                <>
                  Domena{' '}
                  <span className="text-white font-mono">{service.account.domain}</span>
                </>
              ) : (
                <span className="font-mono text-neutral-500">{service.id}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {loadError || !service ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100 flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <p>{loadError ?? 'Usługa niedostępna.'}</p>
        </div>
      ) : (
        <PlanChangeForm
          subscriptionId={service.id}
          currentPlanId={service.plan.id}
          currentPlanName={service.plan.name}
          interval={service.interval}
          paymentSource={service.paymentSource}
          status={service.status}
          targetPlans={targetPlans}
          initialPreview={initialPreview}
        />
      )}
    </div>
  );
}

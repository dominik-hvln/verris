import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { PanelPageHeader } from '@/components/panel';
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
          priceMonthly: p.priceMonthly,
          priceYearly: p.priceYearly,
          currency: p.currency,
        }))
    : [];

  let initialPreview: PlanChangePreviewDto | null = null;
  if (service && targetPlans[0]) {
    const res = await previewPlanChangeAction(id, targetPlans[0].id, service.interval);
    if (res.ok) initialPreview = res.data;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
        <Link href="/dashboard/services" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Usługi
        </Link>
        {service ? (
          <>
            <span aria-hidden>/</span>
            <Link href={`/dashboard/services/${id}`} className="rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
              {service.plan.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden>/</span>
        <b className="font-semibold text-foreground">Zmiana planu</b>
      </div>

      <PanelPageHeader
        title="Zmiana planu"
        description={
          service
            ? `Teraz: ${service.plan.name}${service.account?.domain ? ` · ${service.account.domain}` : ''}. Różnicę w cenie przeliczamy proporcjonalnie do końca okresu.`
            : undefined
        }
      />

      {loadError || !service ? (
        <p className="m-0 flex items-center gap-2 rounded-[10px] bg-[color-mix(in_srgb,var(--crit)_12%,transparent)] px-4 py-3 text-sm text-crit">
          <AlertCircle className="h-4 w-4" />
          {loadError ?? 'Usługa niedostępna.'}
        </p>
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

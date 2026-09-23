'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, Wallet } from 'lucide-react';
import { Button } from '@verris/ui';
import type { ServiceDetailsDto, SubscriptionStatus } from '@verris/contracts';
import { fetchServiceDetailsAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import { Kpi, KpiStrip, Meter, SectionHead, StatusPill } from '@/components/panel/v2';
import { EVENT_WARN, serviceEventLabel } from '@/lib/service-events';

const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:border-primary';
import { UnpaidServiceBanner } from '@/components/hosting/UnpaidServiceBanner';
import { PanelModal } from '@/components/panel';
import { cancelSubscriptionAction } from '@/app/dashboard/services/subscription-payment-actions';

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING_PAYMENT: 'Oczekuje płatności',
  PROVISIONING: 'Tworzenie konta',
  ACTIVE: 'Aktywna',
  PAST_DUE: 'Zaległa płatność',
  SUSPENDED: 'Zawieszona',
  CANCELED: 'Anulowana',
  EXPIRED: 'Wygasła',
};

const PAYMENT_LABELS: Record<string, string> = {
  STRIPE_CARD: 'Karta (Stripe)',
  WALLET: 'Portfel Verris',
  MANUAL: 'Ręczna (operator)',
};

const BILLING_EVENT_TYPES = new Set([
  'CREATED',
  'PAYMENT_FAILED',
  'RENEWED',
  'CANCEL_SCHEDULED',
  'CANCELED',
]);

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ServiceSubscriptionTab({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [service, setService] = useState<ServiceDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelImmediate, setCancelImmediate] = useState(false);

  // Chwila odczytu usługi — z niej liczymy postęp okresu (Date.now() w renderze byłby nieczysty).
  const [checkedAt, setCheckedAt] = useState(0);

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const load = useCallback(
    () =>
      fetchServiceDetailsAction(serviceId)
        .then((svc) => {
          setService(svc);
          setCheckedAt(Date.now());
        })
        .finally(() => setLoading(false)),
    [serviceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const confirmCancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelSubscriptionAction(serviceId, {
        atPeriodEnd: cancelImmediate ? false : true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCancelOpen(false);
      router.refresh();
      await load();
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie subskrypcji…
      </div>
    );
  }

  if (!service) {
    return <p className="text-sm text-rose-200">Nie udało się wczytać danych subskrypcji.</p>;
  }

  const canCancel =
    service.status === 'ACTIVE' ||
    service.status === 'PAST_DUE' ||
    service.status === 'SUSPENDED' ||
    service.status === 'PENDING_PAYMENT';
  const billingEvents = service.events.filter((e) => BILLING_EVENT_TYPES.has(e.type)).slice(0, 8);
  // Brak flagi w DTO — rezygnację na koniec okresu widać po zdarzeniu CANCEL_SCHEDULED.
  const cancelScheduled = service.status === 'ACTIVE' && service.events.some((e) => e.type === 'CANCEL_SCHEDULED');
  const periodPct =
    service.currentPeriodStart && service.currentPeriodEnd
      ? Math.max(
          0,
          Math.min(
            100,
            ((checkedAt - new Date(service.currentPeriodStart).getTime()) /
              (new Date(service.currentPeriodEnd).getTime() - new Date(service.currentPeriodStart).getTime())) *
              100,
          ),
        )
      : null;

  return (
    <div className="min-w-0 space-y-6">
      <UnpaidServiceBanner
        serviceId={serviceId}
        status={service.status}
        paymentSource={service.paymentSource}
      />

      <SectionHead
        title="Subskrypcja i płatności"
        desc="Stan rozliczenia, bieżący okres i rezygnacja."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/billing" className={BTN}>
              <Wallet className="h-[15px] w-[15px]" /> Portfel i faktury
            </Link>
            <Link href={`/dashboard/services/${serviceId}/plan`} className={BTN}>
              Zmiana planu
            </Link>
            {(service.status === 'ACTIVE' || service.status === 'PAST_DUE') && !cancelScheduled ? (
              <a
                href={`/api/services/${serviceId}/proforma`}
                className={BTN}
                title="PDF z kwotą najbliższego odnowienia — np. do akceptacji w księgowości przed płatnością"
              >
                Proforma na odnowienie
              </a>
            ) : null}
          </div>
        }
      />

      <KpiStrip>
        <Kpi
          label="Stan"
          value={<StatusPill tone={service.status === 'ACTIVE' ? 'data' : service.status === 'CANCELED' || service.status === 'EXPIRED' ? 'muted' : 'warn'}>{STATUS_LABELS[service.status] ?? service.status}</StatusPill>}
          foot={<span>płatność: {PAYMENT_LABELS[service.paymentSource] ?? service.paymentSource}</span>}
        />
        <Kpi label="Plan" value={<span className="text-[24px]">{service.plan.name}</span>} foot={<span>{service.interval === 'MONTH' ? 'rozliczenie miesięczne' : 'rozliczenie roczne'}</span>} />
        <Kpi
          label="Cena"
          value={Number(service.priceAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
          unit={`${service.currency === 'PLN' ? 'zł' : service.currency} / ${service.interval === 'MONTH' ? 'mies.' : 'rok'}`}
          foot={<span>brutto</span>}
        />
        <Kpi
          label={cancelScheduled ? 'Działa do' : 'Następne odnowienie'}
          value={<span className="text-[24px]">{formatDate(service.currentPeriodEnd)}</span>}
          foot={<span>okres od {formatDate(service.currentPeriodStart)}</span>}
        >
          {periodPct != null ? <Meter pct={periodPct} tone={periodPct > 90 ? 'warn' : 'data'} tipText={`${Math.round(periodPct)}% okresu minęło`} /> : null}
        </Kpi>
      </KpiStrip>

      {billingEvents.length > 0 ? (
        <section>
          <SectionHead title="Historia rozliczeń" />
          <ul className="m-0 list-none rounded-[10px] border border-line bg-card p-0">
            {billingEvents.map((ev) => (
              <li key={ev.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-line px-4 py-[11px] first:border-t-0">
                <span className={`h-[7px] w-[7px] rounded-full ${EVENT_WARN.has(ev.type) ? 'bg-warn' : 'bg-data'}`} />
                <span className="text-sm text-foreground">{serviceEventLabel(ev.type)}</span>
                <time className="whitespace-nowrap font-mono text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canCancel && service.status !== 'PENDING_PAYMENT' && service.status !== 'PAST_DUE' ? (
        <section className="rounded-[10px] border border-line bg-card px-4 py-3.5">
          <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Zakończenie usługi</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Domyślnie usługa działa do końca opłaconego okresu i nie odnawia się. Możesz też zakończyć od razu.
          </p>
          <button
            type="button"
            onClick={() => {
              setCancelImmediate(false);
              setCancelOpen(true);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-card px-3 py-2 text-[13px] font-medium text-crit hover:border-crit"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Zrezygnuj z usługi
          </button>
        </section>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <PanelModal
        open={cancelOpen}
        onClose={() => !pending && setCancelOpen(false)}
        title="Zrezygnować z usługi?"
        description={
          cancelImmediate
            ? 'Hosting zostanie zawieszony od razu. Opłata za bieżący okres nie podlega automatycznemu zwrotowi — w razie wątpliwości napisz do wsparcia.'
            : 'Usługa pozostanie aktywna do końca opłaconego okresu, potem nie będzie odnawiana. Nie pobierzemy kolejnej opłaty.'
        }
      >
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3">
            <input
              type="radio"
              name="cancel-mode"
              checked={!cancelImmediate}
              onChange={() => setCancelImmediate(false)}
              className="mt-1"
            />
            <span className="text-sm text-neutral-200">
              <span className="font-medium text-white">Na koniec okresu</span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                Do {formatDate(service.currentPeriodEnd)}
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3">
            <input
              type="radio"
              name="cancel-mode"
              checked={cancelImmediate}
              onChange={() => setCancelImmediate(true)}
              className="mt-1"
            />
            <span className="text-sm text-neutral-200">
              <span className="font-medium text-white">Od razu</span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                Natychmiastowe zawieszenie konta hostingowego
              </span>
            </span>
          </label>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={pending}>
            Wróć
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={confirmCancel}
            className="gap-2"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Potwierdź rezygnację
          </Button>
        </div>
      </PanelModal>
    </div>
  );
}

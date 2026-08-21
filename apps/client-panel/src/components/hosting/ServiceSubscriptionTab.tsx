'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, ExternalLink, Loader2, Receipt, Trash2, Wallet } from 'lucide-react';
import { Button } from '@verris/ui';
import type { ServiceDetailsDto, SubscriptionStatus } from '@verris/contracts';
import { fetchServiceDetailsAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
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

  const load = useCallback(async () => {
    try {
      const svc = await fetchServiceDetailsAction(serviceId);
      setService(svc);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

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

  return (
    <div className="space-y-4 min-w-0">
      <UnpaidServiceBanner
        serviceId={serviceId}
        status={service.status}
        paymentSource={service.paymentSource}
      />

      <HostingTabShell
        title="Subskrypcja i płatności"
        description="Status rozliczenia, okres bieżący i zarządzanie anulowaniem."
        icon={<Receipt className="h-4 w-4" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoRow label="Status" value={STATUS_LABELS[service.status] ?? service.status} />
          <InfoRow
            label="Płatność"
            value={PAYMENT_LABELS[service.paymentSource] ?? service.paymentSource}
          />
          <InfoRow label="Plan" value={service.plan.name} />
          <InfoRow
            label="Cena"
            value={`${Number(service.priceAmount).toFixed(2)} ${service.currency} / ${
              service.interval === 'MONTH' ? 'mies.' : 'rok'
            }`}
          />
          <InfoRow label="Okres od" value={formatDate(service.currentPeriodStart)} />
          <InfoRow label="Okres do" value={formatDate(service.currentPeriodEnd)} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-white/10"
          >
            <Wallet className="h-3.5 w-3.5" />
            Portfel i faktury
          </Link>
          <Link
            href={`/dashboard/services/${serviceId}/plan`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-white/10"
          >
            Zmiana planu
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        </div>

        {canCancel && service.status !== 'PENDING_PAYMENT' && service.status !== 'PAST_DUE' ? (
          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="text-sm font-medium text-white">Zakończenie usługi</p>
            <p className="mt-1 text-xs text-neutral-500">
              Domyślnie hosting działa do końca opłaconego okresu. Możesz też zakończyć od razu.
            </p>
            <button
              type="button"
              onClick={() => {
                setCancelImmediate(false);
                setCancelOpen(true);
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Zrezygnuj z usługi
            </button>
          </div>
        ) : null}
      </HostingTabShell>

      {billingEvents.length > 0 ? (
        <HostingTabShell
          title="Historia rozliczeń"
          description="Ostatnie zdarzenia powiązane z płatnością i subskrypcją."
          icon={<Calendar className="h-4 w-4" />}
        >
          <ul className="space-y-2">
            {billingEvents.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
              >
                <span className="font-medium text-neutral-200">{ev.type}</span>
                <span className="text-neutral-500">
                  {new Date(ev.createdAt).toLocaleString('pl-PL')}
                </span>
              </li>
            ))}
          </ul>
        </HostingTabShell>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

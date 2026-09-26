'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CreditCard, Loader2, Trash2, Wallet } from 'lucide-react';
import { Button } from '@verris/ui';
import type { SubscriptionStatus } from '@verris/contracts';
import { PanelModal } from '@/components/panel';
import {
  abandonUnpaidSubscriptionAction,
  payPastDueFromWalletAction,
  retrySubscriptionPaymentAction,
} from '@/app/dashboard/services/subscription-payment-actions';

export function UnpaidServiceBanner({
  serviceId,
  status,
  paymentSource,
}: {
  serviceId: string;
  status: SubscriptionStatus;
  paymentSource?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (status !== 'PENDING_PAYMENT' && status !== 'PAST_DUE') return null;

  const isPending = status === 'PENDING_PAYMENT';
  const isStripe = paymentSource === 'STRIPE_CARD';

  const confirmTitle = isPending ? 'Anulować zamówienie?' : 'Anulować usługę?';
  const confirmDescription = isPending
    ? 'Zamówienie zniknie z listy usług. Nie zostało jeszcze opłacone — konto hostingowe nie zostanie utworzone. Możesz zamówić usługę ponownie w dowolnym momencie.'
    : 'Usługa zostanie anulowana. Jeśli masz aktywne konto hostingowe, zostanie zawieszone. Tej operacji nie cofniesz z poziomu panelu — w razie wątpliwości skontaktuj się z pomocą.';

  const onRetryPayment = () => {
    setError(null);
    startTransition(async () => {
      const res = await retrySubscriptionPaymentAction(serviceId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    });
  };

  const onPayFromWallet = () => {
    setError(null);
    startTransition(async () => {
      const res = await payPastDueFromWalletAction(serviceId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const confirmAbandon = () => {
    setError(null);
    startTransition(async () => {
      const res = await abandonUnpaidSubscriptionAction(serviceId);
      if (!res.ok) {
        setError(res.error);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-4 rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        <p className="font-semibold text-warn">
          {isPending ? 'Zamówienie oczekuje na płatność' : 'Zaległa opłata za usługę'}
        </p>
        <p className="mt-1 text-xs text-warn">
          {isPending
            ? 'Dokończ płatność lub anuluj zamówienie. Nieopłacone zamówienia bez konta hostingowego są usuwane automatycznie po 48 godzinach.'
            : isStripe
              ? 'Opłać zaległą fakturę w rozliczeniach. Po 3 dniach od nieudanej płatności usługa zostanie zawieszona.'
              : 'Doładuj portfel — pobierzemy opłatę automatycznie w ciągu godziny albo od razu przyciskiem „Opłać z portfela”. Po 3 dniach od nieudanej płatności usługa zostanie zawieszona.'}
        </p>
        {error ? <p className="mt-2 text-xs text-crit">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {isPending && isStripe ? (
            <button
              type="button"
              disabled={pending}
              onClick={onRetryPayment}
              className="inline-flex items-center gap-1.5 rounded-[7px] bg-primary text-primary-foreground font-semibold px-3 py-2 text-xs font-bold hover:bg-data-hi disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
              Opłać w Stripe
            </button>
          ) : null}
          {isPending && !isStripe ? (
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center gap-1.5 rounded-[7px] bg-primary text-primary-foreground font-semibold px-3 py-2 text-xs font-bold hover:bg-data-hi"
            >
              <Wallet className="h-3.5 w-3.5" />
              Portfel / płatność
            </Link>
          ) : null}
          {status === 'PAST_DUE' && !isStripe ? (
            <button
              type="button"
              disabled={pending}
              onClick={onPayFromWallet}
              className="inline-flex items-center gap-1.5 rounded-[7px] bg-primary text-primary-foreground font-semibold px-3 py-2 text-xs font-bold hover:bg-data-hi disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
              Opłać z portfela
            </button>
          ) : null}
          {status === 'PAST_DUE' ? (
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center gap-1.5 rounded-[7px] bg-primary text-primary-foreground font-semibold px-3 py-2 text-xs font-bold hover:bg-data-hi"
            >
              <Wallet className="h-3.5 w-3.5" />
              Rozliczenia
            </Link>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong px-3 py-2 text-xs font-semibold text-[color:var(--verris-body)] hover:bg-raised disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isPending ? 'Anuluj zamówienie' : 'Anuluj usługę'}
          </button>
        </div>
      </div>

      <PanelModal
        open={confirmOpen}
        onClose={() => !pending && setConfirmOpen(false)}
        title={confirmTitle}
        description={confirmDescription}
      >
        <div className="rounded-[10px] border border-warn/30 bg-warn-soft p-4 flex gap-3 text-sm text-warn">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warn" aria-hidden />
          <p>
            {isPending
              ? 'Po anulowaniu nie będziesz mógł dokończyć tej samej płatności — utwórz nowe zamówienie, jeśli nadal chcesz hosting.'
              : 'Upewnij się, że rozliczyłeś zaległość, zanim anulujesz — inaczej stracisz dostęp do panelu hostingu.'}
          </p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmOpen(false)}
            disabled={pending}
          >
            Wróć
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={confirmAbandon}
            className="gap-2"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isPending ? 'Tak, anuluj zamówienie' : 'Tak, anuluj usługę'}
          </Button>
        </div>
      </PanelModal>
    </>
  );
}

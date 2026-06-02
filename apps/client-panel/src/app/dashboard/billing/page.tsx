import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  Info,
  PlusCircle,
  ShieldAlert,
  XCircle,
  History,
} from 'lucide-react';
import Link from 'next/link';
import type {
  SavedPaymentMethodDto,
  WalletAutoTopupSettingsDto,
  WalletSummaryDto,
  WalletTransactionDto,
  WalletTxType,
} from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { PanelPageHeader } from '@/components/panel';
import { CREDIT_DISCLAIMER, CREDIT_RATE_INFO, formatCredits } from '@/lib/credits';
import { getSavedPaymentMethods, getWalletAutoTopup, getWalletSummary } from './data';
import { TopupCard } from './topup-card';
import { BillingExtrasForms } from './billing-extras-forms';
import { BillingWalletRefresh } from './billing-wallet-refresh';

const txLabels: Record<WalletTxType, string> = {
  TOPUP: 'Doładowanie portfela',
  REFUND: 'Zwrot środków',
  CHARGE_SUBSCRIPTION: 'Opłata za usługę',
  CHARGE_PLAN_UPGRADE: 'Upgrade planu (proration)',
  CREDIT_PLAN_DOWNGRADE: 'Downgrade planu (proration)',
  CHARGE_AUTOSCALING: 'Autoskalowanie',
  CHARGE_USAGE: 'Wykorzystanie zasobów',
  ADJUSTMENT: 'Uznanie od Verris',
  PROMO_CREDIT: 'Kod promocyjny',
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  let summary: WalletSummaryDto | null = null;
  let loadError: string | null = null;
  let billingExtras: {
    initialAuto: WalletAutoTopupSettingsDto;
    savedCards: SavedPaymentMethodDto[];
  } | null = null;

  try {
    summary = await getWalletSummary();
    const [autoR, pmR] = await Promise.allSettled([
      getWalletAutoTopup(),
      getSavedPaymentMethods(),
    ]);
    if (autoR.status === 'fulfilled' && pmR.status === 'fulfilled') {
      billingExtras = { initialAuto: autoR.value, savedCards: pmR.value };
    }
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Nie udało się pobrać danych portfela (${err.status}).`
        : err instanceof Error
          ? err.message
          : 'Nieznany błąd';
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <BillingWalletRefresh status={params.status} />
      <PanelPageHeader
        title="Portfel i płatności"
        description={`Doładuj portfel, śledź zużycie i zarządzaj rozliczeniami. ${CREDIT_RATE_INFO}.`}
      />

      {params.status === 'success' ? (
        <StatusBanner
          tone="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Płatność zakończona pomyślnie"
          description="Środki pojawią się w portfelu w ciągu kilku sekund (po potwierdzeniu webhooka)."
        />
      ) : params.status === 'cancel' ? (
        <StatusBanner
          tone="warning"
          icon={<XCircle className="h-5 w-5" />}
          title="Płatność anulowana"
          description="Nie pobraliśmy żadnych środków — możesz spróbować ponownie kiedykolwiek."
        />
      ) : null}

      {loadError ? (
        <StatusBanner
          tone="error"
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Wystąpił problem"
          description={loadError}
        />
      ) : summary ? (
        <>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <TopupCard balance={summary.balance} />
            <SummaryStat
              label="Doładowania (30 dni)"
              value={formatCredits(summary.totalTopupLast30d)}
              tone="positive"
              icon={<ArrowDownLeft className="h-5 w-5" />}
            />
            <SummaryStat
              label="Wydatki (30 dni)"
              value={formatCredits(summary.totalChargesLast30d)}
              tone="negative"
              icon={<ArrowUpRight className="h-5 w-5" />}
            />
          </div>

          {billingExtras ? (
            <BillingExtrasForms
              key={[
                billingExtras.initialAuto.thresholdPln,
                billingExtras.initialAuto.topupAmountPln,
                String(billingExtras.initialAuto.enabled),
                billingExtras.initialAuto.paymentMethodId ?? '',
                billingExtras.initialAuto.lastAttemptAt ?? '',
                billingExtras.savedCards.map((c) => c.id).join(','),
              ].join('|')}
              initialAuto={billingExtras.initialAuto}
              savedCards={billingExtras.savedCards}
            />
          ) : null}

          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white inline-flex items-center gap-2">
                <History className="h-5 w-5 text-neutral-400" />
                Historia transakcji
              </h2>
              <span className="text-sm text-neutral-500">
                Ostatnie {summary.recentTransactions.length} ruchów na portfelu
              </span>
            </div>

            {summary.recentTransactions.length === 0 ? (
              <EmptyTransactions />
            ) : (
              <div className="grid gap-3">
                {summary.recentTransactions.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </div>
            )}
          </section>

          <section>
            <Link
              href="/dashboard/services/new"
              className="flex items-center justify-center gap-3 w-full border-2 border-dashed border-white/10 hover:border-white/30 bg-neutral-900/20 hover:bg-neutral-900/40 text-neutral-300 hover:text-white py-6 rounded-[32px] font-bold transition-all"
            >
              <PlusCircle className="w-6 h-6" /> Kup kolejny pakiet
            </Link>
          </section>

          <section>
            <Link
              href="/dashboard/billing/invoices"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/30 hover:bg-white/[0.06] transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neutral-200">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-white">Faktury</p>
                  <p className="text-sm text-neutral-400 mt-1">
                    Pełna lista faktur z usług opłacanych kartą — pobierzesz je z hostowanej
                    strony Stripe.
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-neutral-500 group-hover:text-white transition-colors" />
            </Link>
          </section>

          <p className="text-xs text-neutral-500 text-center">
            {CREDIT_DISCLAIMER}
          </p>
        </>
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative';
  icon: React.ReactNode;
}) {
  const ring =
    tone === 'positive'
      ? 'border-emerald-400/30 bg-emerald-400/5 text-emerald-100'
      : 'border-rose-400/30 bg-rose-400/5 text-rose-100';
  return (
    <div className="rounded-[32px] border border-white/5 bg-neutral-900/40 p-8 flex flex-col justify-between">
      <div className="flex items-center gap-3">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${ring}`}>
          {icon}
        </div>
        <span className="text-sm font-semibold text-neutral-400 tracking-wider uppercase">
          {label}
        </span>
      </div>
      <div className="mt-8 text-4xl font-black text-white tracking-tight">{value}</div>
    </div>
  );
}

function TransactionRow({ tx }: { tx: WalletTransactionDto }) {
  const numeric = Number.parseFloat(tx.amount);
  const isCredit = numeric > 0;
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-neutral-900/40 p-5 hover:border-white/15 transition-colors">
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${
            isCredit
              ? 'border-emerald-400/30 bg-emerald-400/5 text-emerald-200'
              : 'border-rose-400/30 bg-rose-400/5 text-rose-200'
          }`}
        >
          {isCredit ? (
            <ArrowDownLeft className="h-5 w-5" />
          ) : (
            <ArrowUpRight className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">
            {txLabels[tx.type] ?? tx.type}
          </div>
          <div className="text-xs text-neutral-500 truncate">
            {tx.description ??
              (tx.paymentProvider ? `Płatność ${tx.paymentProvider}` : 'Bez opisu')}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={`text-lg font-bold tabular-nums ${
            isCredit ? 'text-emerald-200' : 'text-white'
          }`}
        >
          {formatCredits(tx.amount, { signed: true })}
        </div>
        <div className="text-xs text-neutral-500">
          {new Date(tx.createdAt).toLocaleString('pl-PL', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {' • saldo '}
          {formatCredits(tx.balanceAfter)}
        </div>
      </div>
    </div>
  );
}

function EmptyTransactions() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <Info className="h-10 w-10 mx-auto text-neutral-500" />
      <h3 className="mt-4 text-xl font-bold text-white">Brak transakcji</h3>
      <p className="mt-2 text-neutral-400">
        Doładuj portfel, by uruchomić pierwszą usługę lub odnowienia automatyczne.
      </p>
    </div>
  );
}

function StatusBanner({
  tone,
  icon,
  title,
  description,
}: {
  tone: 'success' | 'warning' | 'error';
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const palette = {
    success: 'border-emerald-400/30 bg-emerald-400/5 text-emerald-200',
    warning: 'border-amber-400/30 bg-amber-400/5 text-amber-200',
    error: 'border-rose-400/30 bg-rose-400/5 text-rose-200',
  }[tone];
  return (
    <div className={`rounded-2xl border p-5 flex items-start gap-3 ${palette}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="text-sm opacity-90 mt-1">{description}</p>
      </div>
    </div>
  );
}

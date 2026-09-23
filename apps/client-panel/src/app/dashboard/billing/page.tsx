import { CheckCircle2, ChevronRight, ShieldAlert, XCircle } from 'lucide-react';
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
import { CREDIT_DISCLAIMER, CREDIT_RATE_INFO, CREDIT_SHORT, formatCredits } from '@/lib/credits';
import { DualBars, Kpi, KpiStrip, SectionHead } from '@/components/panel/v2';
import { walletTxDescription } from '@/lib/wallet-tx-label';
import { mapWalletMonthlyFlow } from '../dashboard-chart-utils';
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

  const flow = mapWalletMonthlyFlow(summary?.monthlyFlowLast12 ?? []);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <BillingWalletRefresh status={params.status} />
      <PanelPageHeader
        title="Płatności"
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
          <KpiStrip>
            <Kpi label="Saldo portfela" value={formatCredits(summary.balance, { withUnit: false })} unit={CREDIT_SHORT} foot={<span>1 zł = 1 kredyt</span>} />
            <Kpi label="Doładowania · 30 dni" value={formatCredits(summary.totalTopupLast30d, { withUnit: false })} unit={CREDIT_SHORT} foot={<span>wpłaty i bonusy</span>} />
            <Kpi label="Wydatki · 30 dni" value={formatCredits(summary.totalChargesLast30d, { withUnit: false })} unit={CREDIT_SHORT} foot={<span>usługi, autoskalowanie, zużycie</span>} />
            <Kpi
              label="Auto-doładowanie"
              value={billingExtras ? (billingExtras.initialAuto.enabled ? 'Włączone' : 'Wyłączone') : '—'}
              foot={
                <span>
                  {billingExtras?.initialAuto.enabled
                    ? `poniżej ${billingExtras.initialAuto.thresholdPln} zł dopłacimy ${billingExtras.initialAuto.topupAmountPln} zł`
                    : 'ustawisz je w prawej kolumnie'}
                </span>
              }
            />
          </KpiStrip>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <section>
                <SectionHead title="Portfel · 12 miesięcy" desc="Doładowania i wydatki miesiąc po miesiącu." />
                <div className="rounded-[10px] border border-line bg-card px-4 pb-3 pt-4">
                  {flow.some((p) => p.inflow > 0 || p.outflow > 0) ? (
                    <>
                      <DualBars labels={flow.map((p) => p.label)} a={flow.map((p) => p.inflow)} b={flow.map((p) => p.outflow)} aLabel="doładowania" bLabel="wydatki" />
                      <div className="flex gap-4 pt-1 text-[12.5px] text-muted-foreground">
                        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-data-soft" />doładowania</span>
                        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-data" />wydatki</span>
                      </div>
                    </>
                  ) : (
                    <p className="m-0 py-4 text-sm text-muted-foreground">Na razie brak ruchu w portfelu.</p>
                  )}
                </div>
              </section>

              <section>
                <SectionHead
                  title="Historia transakcji"
                  desc={`Ostatnie ${summary.recentTransactions.length} ruchów na portfelu.`}
                  action={
                    <a
                      href="/api/billing/transactions.csv"
                      className="rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-raised"
                    >
                      Pobierz całą historię (CSV)
                    </a>
                  }
                />
                {summary.recentTransactions.length === 0 ? (
                  <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">
                    Brak transakcji — doładuj portfel, by uruchomić pierwszą usługę lub odnowienia automatyczne.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
                    <table className="v2-stack w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className={TH}>Operacja</th>
                          <th className={TH}>Kiedy</th>
                          <th className={`${TH} text-right`}>Kwota</th>
                          <th className={`${TH} text-right`}>Saldo po</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.recentTransactions.map((tx) => (
                          <TransactionRow key={tx.id} tx={tx} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <TopupCard balance={summary.balance} />
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
              <section className="rounded-[10px] border border-line bg-card">
                <ul className="m-0 list-none p-0">
                  <li>
                    <Link href="/dashboard/billing/invoices" className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised/50">
                      <span>
                        <b className="block text-sm font-semibold text-foreground">Faktury</b>
                        <small className="text-[12.5px] text-muted-foreground">faktury z usług opłacanych kartą (Stripe)</small>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                  <li className="border-t border-line">
                    <Link href="/dashboard/services/new" className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised/50">
                      <span>
                        <b className="block text-sm font-semibold text-foreground">Nowa usługa</b>
                        <small className="text-[12.5px] text-muted-foreground">kup kolejny pakiet</small>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <p className="font-mono text-[11.5px] leading-relaxed text-muted-foreground">{CREDIT_DISCLAIMER}</p>
        </>
      ) : null}
    </div>
  );
}

const TH = 'whitespace-nowrap px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground';
const TD = 'border-t border-line px-3 py-[11px] align-middle';

function TransactionRow({ tx }: { tx: WalletTransactionDto }) {
  const isCredit = Number.parseFloat(tx.amount) > 0;
  const when = new Date(tx.createdAt);
  const desc = walletTxDescription(tx.description, tx.paymentProvider);
  return (
    <tr>
      <td className={TD} data-label="Operacja">
        <b className="block font-semibold text-foreground">{txLabels[tx.type] ?? tx.type}</b>
        {desc ? (
          <span className="block text-[12.5px] text-muted-foreground" data-tip={tx.description ? `Zapis w systemie\n${tx.description}` : undefined}>
            {desc}
          </span>
        ) : null}
      </td>
      <td className={`${TD} whitespace-nowrap font-mono text-xs text-muted-foreground`} data-label="Kiedy">
        {when.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
        <span className="block">{when.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
      </td>
      <td
        className={`${TD} whitespace-nowrap text-right font-display text-[15px] font-semibold tabular-nums ${isCredit ? 'text-data-hi' : 'text-foreground'}`}
        data-label="Kwota"
      >
        {formatCredits(tx.amount, { signed: true })}
      </td>
      <td className={`${TD} whitespace-nowrap text-right tabular-nums text-muted-foreground`} data-label="Saldo po">
        {formatCredits(tx.balanceAfter)}
      </td>
    </tr>
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
    success: 'bg-data-soft text-data-hi',
    warning: 'bg-warn-soft text-warn',
    error: 'bg-[color-mix(in_srgb,var(--crit)_12%,transparent)] text-crit',
  }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-[10px] px-4 py-3 ${palette}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="text-sm opacity-90 mt-1">{description}</p>
      </div>
    </div>
  );
}

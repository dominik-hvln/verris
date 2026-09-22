import Link from 'next/link';
import { ArrowRightLeft, ChevronRight, Gauge, Plus, ShieldAlert } from 'lucide-react';
import type { ServiceSummaryDto, SubscriptionStatus } from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { UnpaidServiceBanner } from '@/components/hosting/UnpaidServiceBanner';
import { Label, SectionHead, StatusPill } from '@/components/panel/v2';
import { ConvertTrialButton } from './convert-trial-button';
import { listServices } from './data';

/** PB-15 — wszystkie usługi w nowym wyglądzie (wzorzec: docs/design/wzorzec-panelu.html). */

const STATUS: Record<SubscriptionStatus, string> = {
  PENDING_PAYMENT: 'oczekuje płatności',
  PROVISIONING: 'zakładamy konto',
  ACTIVE: 'działa',
  PAST_DUE: 'zaległa płatność',
  SUSPENDED: 'zawieszona',
  CANCELED: 'anulowana',
  EXPIRED: 'wygasła',
};

const KIND: Record<ServiceSummaryDto['productKind'], string> = {
  HOSTING: 'Hosting',
  EMAIL: 'Poczta',
  EMAIL_MARKETING: 'E-mail marketing',
};

const PROVISIONING: Record<NonNullable<ServiceSummaryDto['provisioning']>['stage'], string> = {
  queued: 'w kolejce',
  running: 'zakładamy konto',
  retrying: 'powtarzamy próbę',
  failed: 'błąd konfiguracji — napisz do pomocy',
  completed: 'gotowe',
};

const TH = 'px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground';
const TD = 'border-t border-line px-3 py-3 align-middle';
const ICON_BTN = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-card text-muted-foreground hover:border-primary hover:text-foreground';

function tone(s: ServiceSummaryDto): 'data' | 'warn' | 'muted' {
  if (s.status === 'CANCELED' || s.status === 'EXPIRED' || s.status === 'PROVISIONING') return 'muted';
  if (s.status !== 'ACTIVE') return 'warn';
  return s.health?.label === 'attention' || s.health?.label === 'critical' ? 'warn' : 'data';
}

function href(s: ServiceSummaryDto) {
  return `/dashboard/services/${s.id}?kind=${s.productKind ?? 'HOSTING'}`;
}

export default async function ServicesPage() {
  let services: ServiceSummaryDto[] = [];
  let loadError: string | null = null;
  try {
    services = await listServices();
  } catch (err) {
    loadError =
      err instanceof ApiError ? `Nie udało się pobrać Twoich usług (${err.status}).` : err instanceof Error ? err.message : 'Nieznany błąd';
  }
  const active = services.filter((s) => s.status !== 'CANCELED' && s.status !== 'EXPIRED');
  const ended = services.filter((s) => s.status === 'CANCELED' || s.status === 'EXPIRED');
  const attention = active.filter((s) => tone(s) === 'warn').length;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>Usługi · {active.length} aktywnych</Label>
          <h1 className="mb-2 mt-1.5 font-display text-[clamp(28px,4vw,40px)] font-extrabold leading-none tracking-[-0.03em] text-foreground">Twoje usługi</h1>
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
            {active.length > 0 ? (
              <>
                {active.length - attention > 0 ? <StatusPill tone="data">{active.length - attention} działa</StatusPill> : null}
                {attention > 0 ? <StatusPill tone="warn">{attention} wymaga uwagi</StatusPill> : null}
              </>
            ) : null}
            <span>hosting, poczta i e-mail marketing w jednym miejscu</span>
          </div>
        </div>
        <Link href="/dashboard/services/new" className="inline-flex items-center gap-2 rounded-md border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Zamów nową usługę
        </Link>
      </header>

      {loadError ? (
        <div className="flex items-start gap-3 rounded-[10px] border border-crit/30 bg-crit/5 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-crit" />
          <div>
            <p className="font-semibold text-foreground">Wystąpił problem</p>
            <p className="mt-1 text-muted-foreground">{loadError}</p>
          </div>
        </div>
      ) : services.length === 0 ? (
        <div className="relative overflow-hidden rounded-[10px] border border-line bg-card px-6 py-12 text-center">
          <div aria-hidden className="verris-pattern-bg pointer-events-none absolute inset-0 opacity-[0.06]" />
          <h2 className="relative font-display text-2xl font-bold text-foreground">Nie masz jeszcze żadnej usługi</h2>
          <p className="relative mx-auto mt-2 max-w-md text-muted-foreground">Wybierz plan dopasowany do Twojej strony — konto założymy w kilka sekund.</p>
          <Link href="/dashboard/services/new" className="relative mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Wybierz plan
          </Link>
        </div>
      ) : (
        <>
          <section>
            <SectionHead title="Aktywne" desc="Kliknij usługę, żeby zarządzać domenami, pocztą, plikami i kopiami." />
            <ServicesTable services={active} />
          </section>
          {ended.length > 0 ? (
            <section>
              <SectionHead title="Zakończone" />
              <ServicesTable services={ended} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function ServicesTable({ services }: { services: ServiceSummaryDto[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
      <table className="v2-stack w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>Usługa</th>
            <th className={TH}>Stan</th>
            <th className={TH}>Zdrowie</th>
            <th className={TH}>Zasoby</th>
            <th className={TH}>Odnowienie</th>
            <th className={TH}>Cena</th>
            <th className={TH} />
          </tr>
        </thead>
        <tbody>
          {services.map((s, i) => {
            const t = tone(s);
            const a = s.account;
            const rec = s.recommendations?.find((r) => r.severity !== 'info');
            return (
              <tr key={s.id} className="group hover:bg-raised/50">
                <td className={TD} data-label="Usługa">
                  <Link href={href(s)} className="flex flex-col">
                    <b className="whitespace-nowrap font-semibold text-foreground">{s.planName}</b>
                    <small className="whitespace-nowrap text-[12.5px] text-muted-foreground">
                      {KIND[s.productKind]}
                      {a?.domain ? ` · ${a.domain}` : ''}
                      {s.serviceTag ? <span className="font-mono"> · {s.serviceTag}</span> : null}
                    </small>
                  </Link>
                  {s.isTrial && s.status !== 'EXPIRED' ? (
                    <div className="mt-2 text-[12px] text-data-hi">
                      Okres próbny{s.trialEndsAt ? ` do ${new Date(s.trialEndsAt).toLocaleDateString('pl-PL')}` : ''}
                      <ConvertTrialButton serviceId={s.id} />
                    </div>
                  ) : null}
                  <UnpaidServiceBanner serviceId={s.id} status={s.status} paymentSource={s.paymentSource} />
                </td>
                <td className={TD} data-label="Stan">
                  <span
                    className={`inline-flex items-center gap-[7px] whitespace-nowrap text-[12.5px] font-semibold ${t === 'data' ? 'text-data-hi' : t === 'warn' ? 'text-warn' : 'text-muted-foreground'}`}
                    data-tip={rec ? `${rec.title}\n${rec.body}` : undefined}
                  >
                    <span className={`h-[7px] w-[7px] rounded-full bg-current ${t === 'data' ? 'v2-breathe' : t === 'warn' ? 'v2-breathe v2-breathe-warn' : ''}`} style={{ ['--v2-i' as string]: i }} />
                    {s.provisioning && s.status !== 'ACTIVE' ? PROVISIONING[s.provisioning.stage] : rec && s.status === 'ACTIVE' ? rec.title : STATUS[s.status]}
                  </span>
                </td>
                <td className={TD} data-label="Zdrowie">
                  {s.health?.score != null ? (
                    <span
                      className={`font-display text-lg font-extrabold tabular-nums ${s.health.score >= 90 ? 'text-data-hi' : s.health.score >= 70 ? 'text-warn' : 'text-crit'}`}
                      data-tip={s.health.summary ?? undefined}
                    >
                      {s.health.score}
                      <small className="ml-0.5 font-mono text-[11px] font-medium text-muted-foreground">/100</small>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`${TD} font-mono text-[12.5px] text-muted-foreground`} data-label="Zasoby">
                  {a ? `${a.cpuLimit}% CPU · ${(a.ramLimitMb / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} GB RAM · ${Math.round(a.diskLimitMb / 1024)} GB` : '—'}
                </td>
                <td className={`${TD} whitespace-nowrap tabular-nums`} data-label="Odnowienie">
                  {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td className={`${TD} whitespace-nowrap tabular-nums`} data-label="Cena">
                  {Number(s.priceAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {s.currency === 'PLN' ? 'zł' : s.currency}
                  {s.interval === 'MONTH' ? ' / mies.' : ' / rok'}
                </td>
                <td className={`${TD} w-[1%]`}>
                  <div className="flex items-center justify-end gap-1.5">
                    {s.status === 'ACTIVE' && a ? (
                      <Link href={`/dashboard/services/${s.id}/plan`} className={ICON_BTN} data-tip="Zmiana planu" aria-label="Zmiana planu">
                        <ArrowRightLeft className="h-4 w-4" />
                      </Link>
                    ) : null}
                    {s.productKind !== 'EMAIL' ? (
                      <Link
                        href={`/dashboard/services/${s.id}/autoscaling`}
                        className={`${ICON_BTN} ${s.autoscalingEnabled ? 'border-data/50 text-data-hi' : ''}`}
                        data-tip={s.autoscalingEnabled ? 'Autoskalowanie: włączone' : 'Autoskalowanie: wyłączone'}
                        aria-label="Autoskalowanie"
                      >
                        <Gauge className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <Link href={href(s)} aria-label={`Otwórz ${s.planName}`} className="px-1 text-muted-foreground group-hover:text-primary">
                      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

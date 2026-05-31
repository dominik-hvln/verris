'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Loader2, Wallet, CreditCard, Cpu, MemoryStick, HardDrive, Tag } from 'lucide-react';
import type { PreviewSubscriptionPromoResult } from '@verris/contracts';
import { previewSubscriptionPromoAction } from './promo-actions';
import type {
  BillingInterval,
  PlanDto,
  SubscriptionPaymentSource,
} from '@verris/contracts';
import { createSubscriptionAction } from './actions';
import { CREDIT_SHORT, formatCredits } from '@/lib/credits';

interface Props {
  plans: PlanDto[];
}

export function NewSubscriptionForm({ plans }: Props) {
  const router = useRouter();
  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? '');
  const [interval, setInterval] = useState<BillingInterval>('MONTH');
  const [paymentSource, setPaymentSource] =
    useState<SubscriptionPaymentSource>('WALLET');
  const [domain, setDomain] = useState<string>('');
  const [autoscalingEnabled, setAutoscalingEnabled] = useState(false);
  const [ecoModeEnabled, setEcoModeEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    daUsername: string;
    daPassword: string;
    domain: string;
  } | null>(null);
  const [provisionQueuedSubId, setProvisionQueuedSubId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoPreview, setPromoPreview] = useState<PreviewSubscriptionPromoResult | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoPending, setPromoPending] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === planId),
    [plans, planId],
  );

  const listPrice = useMemo(() => {
    if (!selectedPlan) return null;
    return interval === 'MONTH' ? selectedPlan.priceMonthly : selectedPlan.priceYearly;
  }, [selectedPlan, interval]);

  const chargePrice = promoPreview?.discountedAmount ?? listPrice;

  const applyPromo = async () => {
    if (!selectedPlan || paymentSource !== 'WALLET') return;
    const code = promoCode.trim();
    if (code.length < 3) {
      setPromoError('Wpisz kod (min. 3 znaki).');
      setPromoPreview(null);
      return;
    }
    setPromoPending(true);
    setPromoError(null);
    const res = await previewSubscriptionPromoAction({
      planId: selectedPlan.id,
      interval,
      code,
    });
    setPromoPending(false);
    if (!res.ok) {
      setPromoPreview(null);
      setPromoError(res.error);
      return;
    }
    setPromoPreview(res.data);
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPlan) return;
    setError(null);
    startTransition(async () => {
      const res = await createSubscriptionAction({
        planId: selectedPlan.id,
        interval,
        paymentSource,
        domain: domain.trim().toLowerCase(),
        autoscalingEnabled,
        ecoModeEnabled,
      });
      if (!res.ok) {
        setError(res.error ?? 'Nie udało się utworzyć usługi');
        return;
      }
      if (res.data?.provisioning) {
        setSuccess({
          daUsername: res.data.provisioning.daUsername,
          daPassword: res.data.provisioning.daPassword,
          domain: res.data.provisioning.domain,
        });
      } else if (res.data?.provisioningQueued && res.data.subscription?.id) {
        setProvisionQueuedSubId(res.data.subscription.id);
      } else if (res.data?.checkoutRedirectUrl) {
        window.location.href = res.data.checkoutRedirectUrl;
      } else {
        router.push('/dashboard/services');
      }
    });
  };

  if (success) {
    return <ProvisioningSuccess {...success} />;
  }

  if (provisionQueuedSubId) {
    return <ProvisioningQueuedBanner subscriptionId={provisionQueuedSubId} />;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section>
        <h2 className="text-xl font-bold text-white">1. Wybierz plan</h2>
        <p className="text-neutral-400 text-sm mt-1">
          Limity zasobów są egzekwowane na serwerze — autoskalowanie dokupuje dodatkową moc
          godzinowo z portfela.
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const active = plan.id === planId;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setPlanId(plan.id)}
                className={`text-left rounded-3xl border p-6 transition-all ${
                  active
                    ? 'border-white bg-white/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-widest text-neutral-400">
                    {plan.slug}
                  </span>
                  {active && <Check className="h-5 w-5 text-white" />}
                </div>
                <h3 className="mt-2 text-2xl font-bold text-white">{plan.name}</h3>
                {plan.description ? (
                  <p className="mt-1 text-sm text-neutral-400 line-clamp-2">{plan.description}</p>
                ) : null}
                <div className="mt-6 space-y-2 text-sm text-neutral-300">
                  <Spec icon={<Cpu className="h-4 w-4 text-neutral-400" />} label={`${plan.cpuLimit}% CPU`} />
                  <Spec
                    icon={<MemoryStick className="h-4 w-4 text-neutral-400" />}
                    label={`${(plan.ramLimitMb / 1024).toFixed(1)} GB RAM`}
                  />
                  <Spec
                    icon={<HardDrive className="h-4 w-4 text-neutral-400" />}
                    label={`${(plan.diskLimitMb / 1024).toFixed(0)} GB SSD`}
                  />
                </div>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">
                    {formatCredits(plan.priceMonthly, { withUnit: false })}
                  </span>
                  <span className="text-neutral-400">{CREDIT_SHORT} / mies.</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Rocznie: {formatCredits(plan.priceYearly)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">2. Okres rozliczeniowy</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 max-w-md">
          <IntervalCard
            value="MONTH"
            label="Miesięcznie"
            current={interval}
            onChange={setInterval}
          />
          <IntervalCard
            value="YEAR"
            label="Rocznie (oszczędzaj)"
            current={interval}
            onChange={setInterval}
          />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">3. Domena główna</h2>
        <p className="text-neutral-400 text-sm mt-1">
          Domena pod którą uruchomimy konto na serwerze. Możesz ją podpiąć później — wpisz roboczą.
        </p>
        <input
          type="text"
          required
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="mojadomena.pl"
          className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
        />
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">4. Sposób płatności</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          <PaymentCard
            value="WALLET"
            current={paymentSource}
            onChange={setPaymentSource}
            icon={<Wallet className="h-5 w-5" />}
            title="Z portfela"
            description="Pobranie środków z portfela natychmiast — usługa uruchomi się od razu."
          />
          <PaymentCard
            value="STRIPE_CARD"
            current={paymentSource}
            onChange={setPaymentSource}
            icon={<CreditCard className="h-5 w-5" />}
            title="Karta przez Stripe"
            description="Cykliczne pobieranie z karty (Stripe Subscriptions). Dostaniesz fakturę po każdym miesięcznym/rocznym pobraniu."
          />
        </div>
      </section>

      {paymentSource === 'WALLET' ? (
        <section className="max-w-2xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Tag className="h-5 w-5 text-emerald-400" aria-hidden />
            Kod rabatowy (opcjonalnie)
          </h2>
          <p className="text-neutral-400 text-sm mt-1">
            Rabat procentowy na pierwszą opłatę za usługę. Działa tylko przy płatności z portfela (K).
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                setPromoPreview(null);
                setPromoError(null);
              }}
              placeholder="np. START20"
              className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white font-mono placeholder:text-neutral-500 focus:border-emerald-500/50 focus:outline-none"
            />
            <button
              type="button"
              disabled={promoPending || !selectedPlan}
              onClick={() => void applyPromo()}
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {promoPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Zastosuj'}
            </button>
          </div>
          {promoError ? <p className="mt-2 text-sm text-rose-300">{promoError}</p> : null}
          {promoPreview ? (
            <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Kod <strong className="font-mono">{promoPreview.code}</strong> — rabat{' '}
              <strong>{promoPreview.percent}%</strong>
              {promoPreview.appliesToRenewals
                ? ' (również na kolejne odnowienia z portfela).'
                : ' (tylko pierwsza opłata).'}
              <br />
              Oszczędzasz{' '}
              <strong>{formatCredits(promoPreview.savingsAmount, { signed: true })}</strong>.
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-white">5. Opcje</h2>
        <div className="mt-3 space-y-3 max-w-2xl">
          <Toggle
            checked={autoscalingEnabled}
            onChange={setAutoscalingEnabled}
            label="Autoskalowanie limitów zasobów"
            description="Aplikacja automatycznie dostanie więcej CPU/RAM, gdy będzie tego potrzebowała. Koszty rozliczane godzinowo z portfela."
          />
          <Toggle
            checked={ecoModeEnabled}
            onChange={setEcoModeEnabled}
            label="ECO Mode (zalecane)"
            description="Optymalizacja wydajności + zbieranie EkoPunktów na sadzenie drzew."
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div>
          <p className="text-sm text-neutral-400">Do zapłaty teraz</p>
          <p className="text-3xl font-bold text-white mt-1">
            {chargePrice ? (
              <>
                {promoPreview && listPrice ? (
                  <span className="block text-lg text-neutral-500 line-through font-normal">
                    {formatCredits(listPrice)}
                  </span>
                ) : null}
                {formatCredits(chargePrice)}
              </>
            ) : (
              '—'
            )}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {paymentSource === 'WALLET'
              ? 'Środki zostaną pobrane z portfela.'
              : 'Po przekierowaniu do Stripe.'}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending || !selectedPlan || !domain.trim()}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-black hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? 'Tworzenie usługi…' : 'Zamów i opłać'}
        </button>
      </div>
    </form>
  );
}

function Spec({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function IntervalCard({
  value,
  label,
  current,
  onChange,
}: {
  value: BillingInterval;
  label: string;
  current: BillingInterval;
  onChange: (next: BillingInterval) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`rounded-2xl border px-5 py-4 text-left transition-all ${
        active
          ? 'border-white bg-white/10 text-white'
          : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/30'
      }`}
    >
      <span className="block text-sm font-bold uppercase tracking-widest">{value}</span>
      <span className="block mt-1 text-base">{label}</span>
    </button>
  );
}

function PaymentCard({
  value,
  current,
  onChange,
  icon,
  title,
  description,
  disabled,
}: {
  value: SubscriptionPaymentSource;
  current: SubscriptionPaymentSource;
  onChange: (next: SubscriptionPaymentSource) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(value)}
      disabled={disabled}
      className={`rounded-2xl border p-5 text-left transition-all ${
        disabled
          ? 'border-white/5 bg-white/[0.02] text-neutral-500 cursor-not-allowed'
          : active
            ? 'border-white bg-white/10 text-white'
            : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/30'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-bold">{title}</span>
        {disabled ? (
          <span className="ml-auto text-[10px] uppercase tracking-widest text-neutral-500">
            Niedostępne
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-neutral-400">{description}</p>
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start justify-between gap-4 rounded-2xl border p-5 text-left transition-all ${
        checked
          ? 'border-white/30 bg-white/[0.06]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20'
      }`}
    >
      <div>
        <div className="font-semibold text-white">{label}</div>
        <div className="text-sm text-neutral-400 mt-1">{description}</div>
      </div>
      <span
        className={`h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-white bg-white' : 'border-white/20 bg-white/5'
        } relative`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
            checked ? 'left-5 bg-black' : 'left-0.5 bg-white'
          }`}
        />
      </span>
    </button>
  );
}

function ProvisioningQueuedBanner({ subscriptionId }: { subscriptionId: string }) {
  return (
    <div className="rounded-3xl border border-cyan-400/25 bg-cyan-500/10 p-8 space-y-4">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />
        Trwa zakładanie konta
      </h2>
      <p className="text-neutral-300">
        Trwa konfiguracja konta hostingowego. Status zmieni się na{' '}
        <span className="text-white font-semibold">Aktywna</span>, gdy wszystko będzie gotowe — możesz
        odświeżać stronę usługi.
      </p>
      <Link
        href={`/dashboard/services/${subscriptionId}`}
        className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200"
      >
        Otwórz Hosting Manager i status konta
      </Link>
    </div>
  );
}

function ProvisioningSuccess({
  daUsername,
  daPassword,
  domain,
}: {
  daUsername: string;
  daPassword: string;
  domain: string;
}) {
  return (
    <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/5 p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Usługa uruchomiona</h2>
        <p className="text-neutral-300 mt-1">
          Twoje konto hostingowe dla domeny <strong>{domain}</strong> jest gotowe. Poniżej
          znajdziesz dane logowania do panelu — zachowaj je w bezpiecznym miejscu, nie pokażemy ich
          ponownie.
        </p>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <dt className="text-xs uppercase tracking-widest text-neutral-500">Login hostingowy</dt>
          <dd className="mt-2 font-mono text-white text-base">{daUsername}</dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <dt className="text-xs uppercase tracking-widest text-neutral-500">Hasło</dt>
          <dd className="mt-2 font-mono text-white text-base break-all">{daPassword}</dd>
        </div>
      </dl>
      <a
        href="/dashboard/services"
        className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200"
      >
        Wróć do listy usług
      </a>
    </div>
  );
}

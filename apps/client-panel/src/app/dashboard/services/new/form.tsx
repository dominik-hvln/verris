'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
import { registerDomainClientAction } from '@/app/dashboard/domains/actions';
import { DomainStep, type DomainSelection } from './domain-step';
import { CREDIT_SHORT, formatCredits } from '@/lib/credits';

interface StartOffer {
  cardEnabled: boolean;
  monthlyDiscountPct: number;
  annualDiscountPct: number;
}

interface Props {
  plans: PlanDto[];
  /** UX-3 — wstępnie wybrany interwał (ze ścieżki z kartą: rocznie/miesięcznie). */
  initialInterval?: BillingInterval;
  /** UX-3 — kod promo auto-stosowany dla ścieżki z kartą (rabat 1. roku). */
  initialPromo?: string;
  /** BILL-1 — rabat startowy z ustawień (auto-naliczany z portfela, bez kuponu). */
  startOffer?: StartOffer;
}

export function NewSubscriptionForm({ plans, initialInterval, initialPromo, startOffer }: Props) {
  const router = useRouter();
  const hasEmailPlans = useMemo(() => plans.some((p) => p.productKind === 'EMAIL'), [plans]);
  const hasHostingPlans = useMemo(
    () => plans.some((p) => (p.productKind ?? 'HOSTING') === 'HOSTING'),
    [plans],
  );
  // UX-4 — pokaż wewnętrzny przełącznik typu TYLKO gdy w przekazanych planach są
  // oba rodzaje. Po redesignie wybór typu robi chooser (OrderFlow), więc tu
  // zwykle dostajemy jeden rodzaj — domyślny `productKind` musi z niego wynikać.
  const showKindToggle = hasEmailPlans && hasHostingPlans;
  const initialKind: 'HOSTING' | 'EMAIL' = (plans[0]?.productKind ?? 'HOSTING') as
    | 'HOSTING'
    | 'EMAIL';
  const [productKind, setProductKind] = useState<'HOSTING' | 'EMAIL'>(initialKind);
  const visiblePlans = useMemo(
    () => plans.filter((p) => (p.productKind ?? 'HOSTING') === productKind),
    [plans, productKind],
  );
  const [planId, setPlanId] = useState<string>(
    plans.find((p) => (p.productKind ?? 'HOSTING') === initialKind)?.id ?? plans[0]?.id ?? '',
  );

  const switchKind = (kind: 'HOSTING' | 'EMAIL') => {
    setProductKind(kind);
    const first = plans.find((p) => (p.productKind ?? 'HOSTING') === kind);
    if (first) setPlanId(first.id);
  };
  const [interval, setInterval] = useState<BillingInterval>(initialInterval ?? 'MONTH');
  const [paymentSource, setPaymentSource] =
    useState<SubscriptionPaymentSource>('WALLET');
  const [domainSel, setDomainSel] = useState<DomainSelection>({
    mode: 'own',
    domain: '',
    register: null,
  });
  const domain = domainSel.domain;
  const [autoscalingEnabled, setAutoscalingEnabled] = useState(false);
  const [ecoModeEnabled, setEcoModeEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    daUsername: string;
    daPassword: string;
    domain: string;
    productKind: 'HOSTING' | 'EMAIL';
  } | null>(null);
  const [provisionQueuedSubId, setProvisionQueuedSubId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState(initialPromo ?? '');
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

  // BILL-1 — rabat startowy z ustawień (tylko portfel, tylko gdy włączona ścieżka
  // z kartą/rabatem). Naliczany automatycznie, bez kodu; odnowienie pełną kwotą.
  const startPct =
    paymentSource === 'WALLET' && startOffer?.cardEnabled
      ? interval === 'YEAR'
        ? startOffer.annualDiscountPct
        : startOffer.monthlyDiscountPct
      : 0;
  const startDiscounted = useMemo(() => {
    if (listPrice == null || startPct <= 0) return null;
    const n = Number(listPrice);
    if (!Number.isFinite(n)) return null;
    return (Math.round(n * (100 - startPct)) / 100).toFixed(2);
  }, [listPrice, startPct]);

  // BILL-1 — kwota do zapłaty wg reguły „nie łączymy promocji": kod (jeśli wygrywa)
  // → rabat startowy → cena listowa.
  const chargePrice = promoPreview?.effectiveDiscounted ?? startDiscounted ?? listPrice;
  const showStrike =
    chargePrice != null && listPrice != null && Number(chargePrice) !== Number(listPrice);

  // P-7 — zachęta do planu rocznego: oszczędność vs 12× miesięcznie.
  const { annualSavingsPct, annualSavingsAmount } = useMemo(() => {
    if (!selectedPlan) return { annualSavingsPct: 0, annualSavingsAmount: 0 };
    const m = Number(selectedPlan.priceMonthly);
    const y = Number(selectedPlan.priceYearly);
    if (!Number.isFinite(m) || !Number.isFinite(y) || m <= 0 || y <= 0) {
      return { annualSavingsPct: 0, annualSavingsAmount: 0 };
    }
    const full = m * 12;
    if (y >= full) return { annualSavingsPct: 0, annualSavingsAmount: 0 };
    return {
      annualSavingsPct: Math.round((1 - y / full) * 100),
      annualSavingsAmount: Math.round((full - y) * 100) / 100,
    };
  }, [selectedPlan]);

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

  // UX-3 — auto-zastosowanie kodu rabatowego ze ścieżki z kartą (raz, po
  // załadowaniu planu). Best-effort: gdy kod jest nieprawidłowy, po prostu
  // pokaże się błąd promo, a klient może go usunąć.
  const autoPromoTried = useRef(false);
  useEffect(() => {
    if (autoPromoTried.current) return;
    if (!initialPromo || !selectedPlan || paymentSource !== 'WALLET') return;
    autoPromoTried.current = true;
    void applyPromo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPromo, selectedPlan, paymentSource]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPlan) return;
    setError(null);
    startTransition(async () => {
      // O-3: when the customer chose to register a new domain, register it
      // first (wallet charge) so hosting and domain are ordered together. If it
      // fails we stop before provisioning. A registered domain the customer
      // keeps even if the subsequent hosting step were to fail.
      if (domainSel.mode === 'register') {
        if (!domainSel.register) {
          setError('Wybierz domenę do rejestracji lub przełącz na własną domenę.');
          return;
        }
        try {
          await registerDomainClientAction({
            name: domainSel.register.name,
            years: domainSel.register.years,
            nameservers: [],
          });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Rejestracja domeny nie powiodła się.',
          );
          return;
        }
      }

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
          productKind: (selectedPlan?.productKind ?? 'HOSTING') as 'HOSTING' | 'EMAIL',
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
      {showKindToggle ? (
        <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => switchKind('HOSTING')}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition-colors ${
              productKind === 'HOSTING' ? 'bg-white text-black' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Hosting
          </button>
          <button
            type="button"
            onClick={() => switchKind('EMAIL')}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition-colors ${
              productKind === 'EMAIL' ? 'bg-white text-black' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Poczta e-mail
          </button>
        </div>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-white">1. Wybierz plan</h2>
        <p className="text-neutral-400 text-sm mt-1">
          {productKind === 'EMAIL'
            ? 'Profesjonalna poczta na Twojej domenie — skrzynki, webmail Roundcube, antyspam.'
            : 'Limity zasobów są egzekwowane na serwerze — autoskalowanie dokupuje dodatkową moc godzinowo z portfela.'}
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {visiblePlans.map((plan) => {
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
                {plan.supportSlaHours > 0 ? (
                  <p className="text-[11px] text-emerald-300/90 mt-2">
                    Wsparcie: odpowiedź do {plan.supportSlaHours} h
                  </p>
                ) : null}
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
        {annualSavingsPct > 0 ? (
          <p className="mt-3 text-sm text-emerald-300">
            💡 Płacąc rocznie oszczędzasz <strong>{annualSavingsPct}%</strong>
            {annualSavingsAmount ? ` (${formatCredits(annualSavingsAmount)} / rok)` : ''} względem płatności miesięcznej.
          </p>
        ) : null}
      </section>

      <DomainStep value={domainSel} onChange={setDomainSel} />

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
            promoPreview.codeWins ? (
              <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Kod <strong className="font-mono">{promoPreview.code}</strong> — rabat{' '}
                <strong>{promoPreview.percent}%</strong>
                {promoPreview.appliesToRenewals
                  ? ' (również na kolejne odnowienia z portfela).'
                  : ' (tylko pierwsza opłata).'}
                <br />
                Oszczędzasz{' '}
                <strong>{formatCredits(promoPreview.savingsAmount, { signed: true })}</strong>.
                {promoPreview.comparisonMessage ? (
                  <span className="mt-1 block text-xs text-emerald-200/80">
                    {promoPreview.comparisonMessage}
                  </span>
                ) : null}
              </div>
            ) : (
              // BILL-1 — kod gorszy od promocji startowej: nie łączymy, zostawiamy lepszą.
              <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                {promoPreview.comparisonMessage ??
                  `Ten kod daje mniejszy rabat niż promocja na start — naliczamy korzystniejszą promocję (${promoPreview.startPercent}%).`}
                <br />
                Naliczona cena uwzględnia rabat startowy{' '}
                <strong>{promoPreview.startPercent}%</strong>.
              </div>
            )
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-white">5. Opcje</h2>
        <div className="mt-3 space-y-3 max-w-2xl">
          {/* Autoskalowanie nie dotyczy poczty — pokazujemy tylko dla hostingu. */}
          {selectedPlan?.productKind !== 'EMAIL' ? (
            <Toggle
              checked={autoscalingEnabled}
              onChange={setAutoscalingEnabled}
              label="Autoskalowanie limitów zasobów"
              description="Aplikacja automatycznie dostanie więcej CPU/RAM, gdy będzie tego potrzebowała. Koszty rozliczane godzinowo z portfela."
            />
          ) : null}
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
                {showStrike ? (
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
          {!promoPreview && startPct > 0 ? (
            <p className="mt-1 text-xs font-medium text-emerald-300">
              Rabat na start −{startPct}% (pierwsza opłata). Odnowienie pełną kwotą.
            </p>
          ) : null}
          <p className="text-xs text-neutral-500 mt-1">
            {paymentSource === 'WALLET'
              ? 'Środki zostaną pobrane z portfela.'
              : 'Po przekierowaniu do Stripe.'}
          </p>
        </div>
        <button
          type="submit"
          disabled={
            pending ||
            !selectedPlan ||
            (domainSel.mode === 'own' ? !domain.trim() : !domainSel.register)
          }
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-black hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending
            ? 'Tworzenie usługi…'
            : domainSel.mode === 'register'
              ? 'Zarejestruj domenę, zamów i opłać'
              : 'Zamów i opłać'}
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
  productKind,
}: {
  daUsername: string;
  daPassword: string;
  domain: string;
  productKind: 'HOSTING' | 'EMAIL';
}) {
  // Poczta nie ma hostingu WWW ani logowania do panelu DA — skrzynkami zarządza
  // się w panelu (zakładka Poczta) i przez webmail. Nie pokazujemy danych DA.
  if (productKind === 'EMAIL') {
    return (
      <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/5 p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Usługa poczty uruchomiona</h2>
          <p className="text-neutral-300 mt-1">
            Poczta dla domeny <strong>{domain}</strong> jest gotowa. Skrzynki zakładasz i obsługujesz
            w panelu — bez osobnego logowania do panelu hostingu.
          </p>
        </div>
        <ol className="space-y-2 text-sm text-neutral-300">
          <li>1. Skonfiguruj DNS poczty (rekordy <strong>MX, SPF, DKIM</strong>) w zakładce „Domeny &amp; DNS".</li>
          <li>2. Załóż skrzynki e-mail w zakładce „Poczta" i ustaw hasła.</li>
          <li>3. Zaloguj się do webmaila adresem skrzynki (nie danymi panelu).</li>
        </ol>
        <a
          href="/dashboard/services"
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200"
        >
          Przejdź do usługi poczty
        </a>
      </div>
    );
  }

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

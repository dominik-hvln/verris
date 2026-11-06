'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Loader2, Wallet, CreditCard, Cpu, MemoryStick, HardDrive, Tag, Landmark, Mail, Send } from 'lucide-react';
import type { PreviewSubscriptionPromoResult } from '@verris/contracts/klient';
import { HOSTING_MAIL_DAILY_SEND_LIMIT } from '@verris/contracts/klient';
import { previewSubscriptionPromoAction } from './promo-actions';
import type {
  BillingInterval,
  PlanDto,
  SubscriptionPaymentSource,
} from '@verris/contracts/klient';
import { createSubscriptionAction } from './actions';
import { abonentZProfiluAction, registerDomainClientAction, type Abonent } from '@/app/dashboard/domains/actions';
import { RegistrantFields, PUSTY_ABONENT, brakiAbonenta } from '@/app/dashboard/domains/components/registrant-fields';
import { DomainStep, type DomainSelection } from './domain-step';
import { formatPln } from '@/lib/credits';
import { trackBeginCheckout, trackPurchase } from '@/lib/analytics-events';
import { Checkbox } from '@/components/panel/checkbox';
import { liczba } from '@/lib/liczba';
import { plForm } from '@/lib/pl';
import { odpakuj } from '@/lib/wynik-akcji';
import { ZASADA_FAKTUR } from '@/app/dashboard/billing/zasady-dokumentow';
import { dodatekNettoIK, odczytajLimit, zlBrutto } from './ceny-zamowienia';
import { sprawdzDomene } from './domena';
import { InformacjePrzedumowne } from './informacje-przedumowne';
import { korzyscZamowienia } from '@/lib/kredyty-autoskalowania';

/** Decyzja 6.11.2026 — kredyty na autoskalowanie przy pierwszym zakupie hostingu (zł brutto, z ustawień oferty). */
interface KredytyStartowe {
  rok: number;
  miesiac: number;
  waznoscMiesiecy: number;
}

interface Props {
  plans: PlanDto[];
  /** UX-3 — wstępnie wybrany interwał (ze ścieżki z kartą: rocznie/miesięcznie). */
  initialInterval?: BillingInterval;
  /**
   * P2-02 (beta 3.11) — okres sterowany z zewnątrz (kafelki „Jak chcesz zacząć?” nad formularzem). Kafelek zmieniał
   * tylko adres, a formularz czytał okres raz, przy pierwszym renderze — klient klikał „Rok z góry” i płacił za miesiąc.
   */
  interval?: BillingInterval;
  onIntervalChange?: (next: BillingInterval) => void;
  /** UX-3 — kod promo auto-stosowany dla ścieżki z kartą (rabat 1. roku). */
  initialPromo?: string;
  /**
   * Kredyty na autoskalowanie przy pierwszym zakupie hostingu (tylko płatność z portfela, jak w API). Podane tylko,
   * gdy klientowi przysługują — formularz pokazuje wtedy korzyść przy kwocie do zapłaty.
   */
  kredytyStartowe?: KredytyStartowe;
  /** O-07 — klient resellera płaci z portfela (karta odnawiałaby się ceną z cennika). */
  bezKarty?: boolean;
  /** Klient resellera — kody rabatowe Verris go nie obejmują (API odrzuca kod). */
  bezKodu?: boolean;
  /** Zakup tej usługi od razu BLIK-iem lub przelewem (Paynow) — faktura nazywa usługę i okres. */
  paynowDostepny?: boolean;
}

/** Sposób zapłaty w formularzu: źródło płatności usługi + „Paynow” (portfel jako źródło odnowień, zapłata teraz). */
type SposobPlatnosci = SubscriptionPaymentSource | 'PAYNOW';

export function NewSubscriptionForm({
  plans,
  initialInterval,
  interval: intervalZZewnatrz,
  onIntervalChange,
  initialPromo,
  kredytyStartowe,
  bezKarty,
  bezKodu,
  paynowDostepny,
}: Props) {
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
  const initialKind: PlanDto['productKind'] = plans[0]?.productKind ?? 'HOSTING';
  const [productKind, setProductKind] = useState<PlanDto['productKind']>(initialKind);
  // Q-05 — pakiet Newsletter: usługa aplikacyjna, bez domeny, serwera i opcji hostingu.
  const newsletter = productKind === 'EMAIL_MARKETING';
  const kategoria = newsletter ? 'email-marketing' : productKind === 'EMAIL' ? 'email' : 'hosting';
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
  const [wlasnyOkres, setWlasnyOkres] = useState<BillingInterval>(initialInterval ?? 'MONTH');
  const interval: BillingInterval = intervalZZewnatrz ?? wlasnyOkres;
  const setInterval = (next: BillingInterval) => {
    setWlasnyOkres(next);
    onIntervalChange?.(next);
  };
  const [paymentSource, setPaymentSource] =
    useState<SubscriptionPaymentSource>('WALLET');
  const [oplata, setOplata] = useState<'PORTFEL' | 'PAYNOW'>('PORTFEL');
  const zPaynow = paymentSource === 'WALLET' && oplata === 'PAYNOW';
  const sposob: SposobPlatnosci = zPaynow ? 'PAYNOW' : paymentSource;
  const wybierzSposob = (v: SposobPlatnosci) => {
    setPaymentSource(v === 'PAYNOW' ? 'WALLET' : v);
    setOplata(v === 'PAYNOW' ? 'PAYNOW' : 'PORTFEL');
  };
  const [domainSel, setDomainSel] = useState<DomainSelection>({
    mode: 'own',
    domain: '',
    register: null,
  });
  const domain = domainSel.domain;
  const [autoscalingEnabled, setAutoscalingEnabled] = useState(false);
  // Decyzja 6 (3.11) — domyślnie bez limitu kosztu, z prostą opcją „ustaw własny limit”.
  const [limitTryb, setLimitTryb] = useState<'bez' | 'wlasny'>('bez');
  const [limitKwota, setLimitKwota] = useState('');
  // Decyzja 7 (3.11) — Tryb EKO domyślnie wyłączony: kopie co noc, rzadsze tylko po świadomym włączeniu.
  const [ecoModeEnabled, setEcoModeEnabled] = useState(false);
  // A2-08 — osobne zgody: Regulamin z DPA oraz żądanie rozpoczęcia świadczenia przed upływem terminu odstąpienia
  // (art. 15 ust. 3 / 21 ust. 2 upk). Polityka prywatności to informacja, nie umowa — bez checkboxa.
  const [zgodaRegulamin, setZgodaRegulamin] = useState(false);
  const [immediateConsent, setImmediateConsent] = useState(false);
  const [domainWaiverConsent, setDomainWaiverConsent] = useState(false);
  const [pokazBraki, setPokazBraki] = useState(false);
  // Decyzja 21 (4.11.2026): oświadczenie domenowe przy każdym zamówieniu — zmiana domeny do rejestracji je kasuje.
  const domenaOswiadczenia = domainSel.register?.name ?? null;
  const [oswiadczenieDla, setOswiadczenieDla] = useState(domenaOswiadczenia);
  if (oswiadczenieDla !== domenaOswiadczenia) {
    setOswiadczenieDla(domenaOswiadczenia);
    setDomainWaiverConsent(false);
  }
  // A-13 — abonentem rejestrowanej domeny jest klient (podpowiedź z profilu).
  const [abonent, setAbonent] = useState<Abonent | null>(null);
  useEffect(() => {
    if (domainSel.mode !== 'register' || abonent !== null) return;
    void abonentZProfiluAction().then((p) => setAbonent({ ...PUSTY_ABONENT, ...p }));
  }, [domainSel.mode, abonent]);
  const [error, setError] = useState<string | null>(null);
  // R1-01 (retest 109): komunikat błędu stoi nad sekcją „Zanim zamówisz”, a przycisk jest niżej — po błędzie
  // przewijamy do komunikatu i dajemy mu fokus, żeby osoba widząca też go zobaczyła.
  const bladRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error || !bladRef.current) return;
    bladRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    bladRef.current.focus({ preventScroll: true });
  }, [error]);
  const [success, setSuccess] = useState<{
    daUsername: string;
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
  const zAutoskalowaniem = !newsletter && selectedPlan?.productKind !== 'EMAIL' && autoscalingEnabled;
  const limit = zAutoskalowaniem && limitTryb === 'wlasny' ? odczytajLimit(limitKwota) : null;
  const domena = !newsletter && domainSel.mode === 'own' && domain.trim() ? sprawdzDomene(domain) : null;

  const listPrice = useMemo(() => {
    if (!selectedPlan) return null;
    return interval === 'MONTH' ? selectedPlan.priceMonthly : selectedPlan.priceYearly;
  }, [selectedPlan, interval]);

  // Decyzja 6.11.2026 — bez rabatu na start: do zapłaty cena z cennika albo z kodu rabatowego (promocja admina).
  const chargePrice = promoPreview?.discountedAmount ?? listPrice;
  const showStrike =
    chargePrice != null && listPrice != null && Number(chargePrice) !== Number(listPrice);
  // P2-03 — cena odnowienia podana z góry: pełna cena z cennika, chyba że kod obejmuje też odnowienia.
  const renewalPrice = promoPreview?.appliesToRenewals ? promoPreview.discountedAmount : listPrice;
  // Kredyty na autoskalowanie przy pierwszym zakupie hostingu — tylko z portfela (także Paynow), jak w API.
  const kredytStartowy =
    kredytyStartowe && paymentSource === 'WALLET' && !newsletter && selectedPlan?.productKind === 'HOSTING'
      ? interval === 'YEAR'
        ? kredytyStartowe.rok
        : kredytyStartowe.miesiac
      : 0;
  const korzysc = korzyscZamowienia(kredytStartowy, interval, kredytyStartowe?.waznoscMiesiecy);

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
      annualSavingsPct: Math.floor((1 - y / full) * 100), // jak www (lib/ceny.ts rabatRocznyProcent): w dół, nigdy zawyżone
      annualSavingsAmount: Math.round((full - y) * 100) / 100,
    };
  }, [selectedPlan]);

  // A3-2 — czego brakuje do zamówienia: widoczne przy przycisku (zamiast cichego `disabled`) i fokus na pierwsze pole.
  const braki: { id: string; tekst: string }[] = [];
  if (!selectedPlan) braki.push({ id: 'plan-zamowienia', tekst: 'wybierz plan' });
  if (!newsletter) {
    if (domainSel.mode === 'own') {
      if (!domain.trim()) braki.push({ id: 'domena-wlasna', tekst: 'wpisz domenę' });
      else if (domena && !domena.ok) braki.push({ id: 'domena-wlasna', tekst: 'popraw adres domeny' });
    } else if (!domainSel.register) {
      braki.push({ id: 'domena-szukaj', tekst: 'wybierz domenę do rejestracji' });
    }
  }
  if (limit && 'blad' in limit) braki.push({ id: 'limit-autoskalowania', tekst: 'wpisz limit kosztu albo wybierz „Bez limitu”' });
  if (!zgodaRegulamin) braki.push({ id: 'zgoda-regulamin', tekst: 'zaakceptuj Regulamin' });
  if (!immediateConsent) braki.push({ id: 'zgoda-swiadczenie', tekst: 'zaznacz zgodę na uruchomienie usługi od razu' });
  if (domainSel.mode === 'register' && !domainWaiverConsent) {
    braki.push({ id: 'zgoda-domena', tekst: 'zaznacz oświadczenie o rejestracji domeny' });
  }

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jednorazowa reakcja na gotowość formularza (plan + portfel), a nie na zdarzenie użytkownika; spinner kodu ma się pokazać
    void applyPromo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPromo, selectedPlan, paymentSource]);

  // Podgląd kodu liczony był dla poprzedniego okresu — po zmianie okresu kwota z kodu byłaby nieaktualna.
  const okresPodgladu = useRef(interval);
  useEffect(() => {
    if (okresPodgladu.current === interval) return;
    okresPodgladu.current = interval;
    setPromoPreview(null);
  }, [interval]);

  // GA4: begin_checkout — raz, po wejściu w formularz zamówienia.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || !selectedPlan) return;
    checkoutTracked.current = true;
    trackBeginCheckout(
      [
        {
          item_name: selectedPlan.name,
          item_category: kategoria,
          quantity: 1,
        },
      ],
      chargePrice != null ? Number(chargePrice) : undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (braki.length > 0 || !selectedPlan) {
      setPokazBraki(true);
      document.getElementById(braki[0]?.id ?? 'plan-zamowienia')?.focus();
      return;
    }
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
        const brakiAb = abonent ? brakiAbonenta(abonent) : ['dane abonenta'];
        if (brakiAb.length || !abonent) {
          setError(`Uzupełnij dane abonenta domeny: ${brakiAb.join(', ')}.`);
          return;
        }
        try {
          odpakuj(await registerDomainClientAction({
            name: domainSel.register.name,
            years: domainSel.register.years,
            nameservers: [],
            withdrawalWaiverConsent: domainWaiverConsent,
            registrant: abonent,
          }));
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Rejestracja domeny nie powiodła się.',
          );
          return;
        }
      }

      const domenaDoZamowienia = newsletter
        ? undefined
        : domainSel.mode === 'own' && domena?.ok
          ? domena.ascii
          : domain.trim().toLowerCase();
      const res = await createSubscriptionAction({
        planId: selectedPlan.id,
        interval,
        paymentSource,
        ...(zPaynow ? { oplata: 'PAYNOW' as const } : {}),
        domain: domenaDoZamowienia,
        autoscalingEnabled: zAutoskalowaniem,
        ...(zAutoskalowaniem && limit && 'kwota' in limit ? { autoscalingMaxCost: limit.kwota } : {}),
        ecoModeEnabled: newsletter ? false : ecoModeEnabled,
        immediatePerformanceConsent: immediateConsent,
      });
      if (!res.ok) {
        setError(res.error ?? 'Nie udało się utworzyć usługi');
        return;
      }
      // GA4: purchase tylko dla płatności z Portfela bez przekierowania (kwota znana). Zakup Paynow wysyła
      // purchase strona powrotu (/dashboard/billing?paynow=…, ZakupPoPowrocie), zakup kartą — serwer po płatności
      // (Measurement Protocol, apps/api subscriptions/pomiar-zakupu.ts). transaction_id deduplikuje w GA4.
      // Bez id subskrypcji z serwera nie wysyłamy purchase — fabrykowany
      // `sub-${Date.now()}` psuł deduplikację w GA4 i w Meta (event_id).
      if (paymentSource === 'WALLET' && !res.data?.checkoutRedirectUrl && res.data?.subscription?.id) {
        const paid = chargePrice != null ? Number(chargePrice) : NaN;
        trackPurchase({
          transactionId: res.data.subscription.id,
          value: paid,
          items: [
            {
              item_name: selectedPlan.name,
              item_category: kategoria,
              price: Number.isFinite(paid) ? paid : undefined,
              quantity: 1,
            },
          ],
        });
      }
      if (res.data?.provisioning) {
        setSuccess({
          daUsername: res.data.provisioning.daUsername,
          productKind: (selectedPlan?.productKind ?? 'HOSTING') as 'HOSTING' | 'EMAIL',
          domain: res.data.provisioning.domain,
        });
      } else if (res.data?.provisioningQueued && res.data.subscription?.id) {
        setProvisionQueuedSubId(res.data.subscription.id);
      } else if (res.data?.checkoutRedirectUrl) {
        window.location.href = res.data.checkoutRedirectUrl;
      } else if (newsletter && res.data?.subscription?.id) {
        // Usługa aktywna od razu — prosto do przestrzeni e-mail marketingu.
        router.push(`/dashboard/email-marketing/${res.data.subscription.id}`);
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

  const zablokowany = braki.length > 0;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {showKindToggle ? (
        <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            aria-pressed={productKind === 'HOSTING'}
            onClick={() => switchKind('HOSTING')}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition-colors ${
              productKind === 'HOSTING' ? 'bg-white text-black' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Hosting
          </button>
          <button
            type="button"
            aria-pressed={productKind === 'EMAIL'}
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
          {newsletter
            ? 'Newslettery do własnej listy odbiorców. Limit kontaktów obejmuje zapisanych i oczekujących na potwierdzenie; wysyłki liczymy w miesiącu kalendarzowym.'
            : productKind === 'EMAIL'
            ? 'Firmowa poczta w Twojej domenie: skrzynki, poczta w przeglądarce, filtr antyspamowy.'
            : 'Limity zasobów pilnujemy na serwerze. Gdy włączysz autoskalowanie, dodatkową moc doliczamy z portfela w blokach po 15 minut.'}
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {visiblePlans.map((plan, i) => {
            const active = plan.id === planId;
            return (
              <button
                key={plan.id}
                id={i === 0 ? 'plan-zamowienia' : undefined}
                type="button"
                aria-pressed={active}
                onClick={() => setPlanId(plan.id)}
                className={`text-left rounded-3xl border p-6 transition-all ${
                  active
                    ? 'border-white bg-white/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                  {active && <Check className="h-5 w-5 shrink-0 text-white" aria-hidden />}
                </div>
                {plan.description ? (
                  <p className="mt-1 text-sm text-neutral-400">{plan.description}</p>
                ) : null}
                {plan.productKind === 'EMAIL_MARKETING' ? (
                  <NewsletterLimity plan={plan} />
                ) : plan.productKind === 'EMAIL' ? (
                  <PocztaParametry plan={plan} />
                ) : (
                  <HostingParametry plan={plan} />
                )}
                <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-3xl font-bold text-white">{formatPln(plan.priceMonthly)}</span>
                  <span className="text-neutral-400">brutto / mies.</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">{dodatekNettoIK(plan.priceMonthly)}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Rocznie: {zlBrutto(plan.priceYearly)}
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
        <div role="group" aria-label="Okres rozliczeniowy" className="mt-3 grid grid-cols-2 gap-3 max-w-md">
          <IntervalCard
            value="MONTH"
            label="Miesięcznie"
            current={interval}
            onChange={setInterval}
          />
          <IntervalCard
            value="YEAR"
            label="Rocznie (taniej)"
            current={interval}
            onChange={setInterval}
          />
        </div>
        {annualSavingsPct > 0 ? (
          <p className="mt-3 text-sm text-emerald-300">
            Płacąc rocznie, oszczędzasz <strong>{annualSavingsPct}%</strong>
            {annualSavingsAmount ? ` (${formatPln(annualSavingsAmount)} na rok)` : ''} w porównaniu z płatnością miesięczną.
          </p>
        ) : null}
      </section>

      {newsletter ? null : (
        <DomainStep
          value={domainSel}
          onChange={setDomainSel}
          dlaPoczty={productKind === 'EMAIL'}
          bladDomeny={domena && !domena.ok ? domena.blad : null}
          zapisAscii={domena?.ok && domena.ascii !== domena.domena ? domena.ascii : null}
        />
      )}
      {domainSel.mode === 'register' && abonent ? (
        <section className="max-w-2xl space-y-3">
          <h3 className="text-base font-semibold text-white">Abonent domeny</h3>
          <RegistrantFields value={abonent} onChange={setAbonent} />
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-white">{newsletter ? 3 : 4}. Sposób płatności</h2>
        <div role="group" aria-label="Sposób płatności" className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          <PaymentCard
            value="WALLET"
            current={sposob}
            onChange={wybierzSposob}
            icon={<Wallet className="h-5 w-5" />}
            title="Z portfela"
            description="Pobierzemy kwotę z portfela od razu i usługa uruchomi się natychmiast."
          />
          {paynowDostepny ? (
            <PaymentCard
              value="PAYNOW"
              current={sposob}
              onChange={wybierzSposob}
              icon={<Landmark className="h-5 w-5" />}
              title="BLIK lub przelew"
              description="Zapłacisz za tę usługę od razu. Po wpłacie usługa uruchomi się sama, a faktura wskaże usługę i okres. Odnowienia z portfela."
            />
          ) : null}
          {bezKarty ? null : (
            <PaymentCard
              value="STRIPE_CARD"
              current={sposob}
              onChange={wybierzSposob}
              icon={<CreditCard className="h-5 w-5" />}
              title="Karta płatnicza"
              description={`Pobieramy opłatę z karty ${interval === 'YEAR' ? 'co rok' : 'co miesiąc'}. Fakturę dostaniesz po każdym pobraniu.`}
            />
          )}
        </div>
        {bezKarty ? (
          <p className="mt-2 max-w-2xl text-xs text-neutral-400">
            Twoje konto prowadzi partner – za usługę płacisz z portfela. Portfel doładujesz kartą albo BLIK-iem.
          </p>
        ) : null}
      </section>

      {paymentSource === 'WALLET' && !bezKodu ? (
        <section className="max-w-2xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Tag className="h-5 w-5 text-emerald-400" aria-hidden />
            Kod rabatowy (opcjonalnie)
          </h2>
          <p className="text-neutral-400 text-sm mt-1">
            Rabat procentowy na pierwszą opłatę za usługę, tylko przy płatności z portfela. Kod testera i kod na
            kredyty wpisujesz w Płatnościach, w polu „Kod promocyjny”.
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void applyPromo();
                }
              }}
              placeholder="np. START20"
              aria-label="Kod rabatowy"
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
          {promoError ? <p className="mt-2 text-sm text-rose-300" role="alert">{promoError}</p> : null}
          {promoPreview ? (
            <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Kod <strong className="font-mono">{promoPreview.code}</strong> – rabat{' '}
              <strong>{promoPreview.percent}%</strong>
              {promoPreview.appliesToRenewals
                ? ' (również na kolejne odnowienia z portfela).'
                : ' (tylko pierwsza opłata).'}
              <br />
              Oszczędzasz{' '}
              <strong>{formatPln(promoPreview.savingsAmount)}</strong>.
            </div>
          ) : null}
        </section>
      ) : null}

      {newsletter ? null : (
      <section>
        <h2 className="text-xl font-bold text-white">5. Opcje</h2>
        <div className="mt-3 space-y-3 max-w-2xl">
          {/* Autoskalowanie nie dotyczy poczty — pokazujemy tylko dla hostingu. */}
          {selectedPlan?.productKind !== 'EMAIL' ? (
            <div className="space-y-3">
              <Toggle
                checked={autoscalingEnabled}
                onChange={setAutoscalingEnabled}
                label="Autoskalowanie limitów zasobów"
                description="Przy skoku ruchu strona dostanie więcej mocy (procesor, pamięć) ponad pakiet. Płacisz z portfela według cennika, w blokach po 15 minut."
              />
              {autoscalingEnabled ? (
                <LimitAutoskalowania
                  tryb={limitTryb}
                  onTryb={setLimitTryb}
                  kwota={limitKwota}
                  onKwota={setLimitKwota}
                  blad={limit && 'blad' in limit && (pokazBraki || limitKwota.trim() !== '') ? limit.blad : null}
                />
              ) : null}
            </div>
          ) : null}
          <Toggle
            checked={ecoModeEnabled}
            onChange={setEcoModeEnabled}
            label="Tryb EKO"
            description="Wyłączony: Twoje harmonogramy kopii działają tak, jak je ustawisz (domyślnie codziennie). Włączenie daje punkty EKO."
          />
          {ecoModeEnabled ? (
            <p role="status" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
              Uwaga: w Trybie EKO kopie, które ustawiasz sam w panelu, robią się raz w tygodniu zamiast codziennie.
              Jeśli coś zepsujesz, odzyskasz stan sprzed nawet kilku dni. Kopie platformy robimy dalej codziennie.
              Tryb EKO wyłączysz w każdej chwili w ustawieniach usługi.
            </p>
          ) : null}
        </div>
      </section>
      )}

      {error ? (
        <div
          ref={bladRef}
          tabIndex={-1}
          id="blad-zamowienia"
          role="alert"
          className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-200 outline-none"
        >
          {error}
        </div>
      ) : null}

      {selectedPlan && chargePrice && listPrice && renewalPrice ? (
        <InformacjePrzedumowne
          nazwaUslugi={selectedPlan.name}
          okres={interval}
          doZaplaty={chargePrice}
          odnowienie={renewalPrice}
          zKarty={paymentSource === 'STRIPE_CARD'}
          kredytAutoskalowania={kredytStartowy}
          waznoscKredytowMiesiecy={kredytyStartowe?.waznoscMiesiecy}
          autoskalowanie={zAutoskalowaniem ? (limit && 'kwota' in limit ? limit.kwota : 0) : null}
          rejestracjaDomeny={domainSel.mode === 'register'}
        />
      ) : null}

      {/* A2-08 — osobne oświadczenia zamiast jednego zbiorczego: akceptacja umowy (Regulamin z SLA i DPA),
          żądanie rozpoczęcia świadczenia przed upływem terminu odstąpienia (art. 15 ust. 3 / 21 ust. 2 upk),
          a przy rejestracji domeny dodatkowo oświadczenie o utracie prawa odstąpienia (art. 38 ust. 1 pkt 1 upk).
          Polityka prywatności to informacja — tylko link, bez „akceptuję”. */}
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="zgoda-regulamin"
            checked={zgodaRegulamin}
            onChange={(e) => setZgodaRegulamin(e.target.checked)}
            aria-invalid={pokazBraki && !zgodaRegulamin ? true : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-white"
          />
          <span className="text-xs leading-relaxed text-neutral-300">
            Akceptuję{' '}
            <a href="/legal/terms" target="_blank" className="underline hover:text-white">
              Regulamin świadczenia usług Verris
            </a>{' '}
            (z SLA i warunkami usług) oraz{' '}
            <a href="/legal/dpa" target="_blank" className="underline hover:text-white">
              Umowę powierzenia przetwarzania danych
            </a>
            .
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="zgoda-swiadczenie"
            checked={immediateConsent}
            onChange={(e) => setImmediateConsent(e.target.checked)}
            aria-invalid={pokazBraki && !immediateConsent ? true : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-white"
          />
          <span className="text-xs leading-relaxed text-neutral-300">
            <strong className="text-white">Proszę o uruchomienie usługi od razu</strong>, przed upływem 14 dni na
            odstąpienie od umowy. Wiem, że jeśli odstąpię, zapłacę za czas, w którym usługa już działała (Regulamin §4
            ust. 4 i §21).
          </span>
        </label>
        <p className="pl-7 text-xs leading-relaxed text-neutral-400">
          Jak przetwarzamy Twoje dane, opisuje{' '}
          <a href="/legal/privacy" target="_blank" className="underline hover:text-white">
            Polityka prywatności
          </a>
          .
        </p>
        {/* Decyzja 21 — przy każdym zamówieniu domeny, zawsze niezaznaczone (bez oświadczenia „na stałe”). */}
        {domainSel.mode === 'register' ? (
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              id="zgoda-domena"
              checked={domainWaiverConsent}
              onChange={(e) => setDomainWaiverConsent(e.target.checked)}
              aria-invalid={pokazBraki && !domainWaiverConsent ? true : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-white"
            />
            <span className="text-xs leading-relaxed text-neutral-300">
              Żądam natychmiastowego wykonania usługi rejestracji domeny
              {domainSel.register ? (
                <> <strong className="text-white">{domainSel.register.name}</strong></>
              ) : null}{' '}
              i przyjmuję do wiadomości, że z chwilą jej zarejestrowania (pełnego wykonania
              usługi) <strong className="text-white">tracę prawo odstąpienia</strong> od umowy w
              tym zakresie (art. 38 ust. 1 pkt 1 ustawy o prawach konsumenta,{' '}
              <a href="/legal/terms" target="_blank" className="underline hover:text-white">
                Regulamin §12 ust. 7–8
              </a>
              ).
            </span>
          </label>
        ) : null}
      </section>

      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-400">Do zapłaty teraz</p>
          <p className="text-3xl font-bold text-white mt-1">
            {chargePrice ? (
              <>
                {showStrike ? (
                  <span className="block text-lg text-neutral-500 line-through font-normal">
                    {formatPln(listPrice)}
                  </span>
                ) : null}
                {formatPln(chargePrice)} <span className="text-base font-normal text-neutral-400">brutto</span>
              </>
            ) : (
              '–'
            )}
          </p>
          {chargePrice ? <p className="text-xs text-neutral-500 mt-1">{dodatekNettoIK(chargePrice)}</p> : null}
          {korzysc ? <p className="mt-1 text-xs font-medium text-emerald-300">{korzysc}</p> : null}
          {showStrike && listPrice ? (
            // P2-03 / Omnibus (art. 4 ust. 2 ustawy o informowaniu o cenach) — przy obniżce z kodu rabatowego najniższa
            // cena z 30 dni przed obniżką. Panel nie ma historii cen: podajemy cenę z cennika (cena regularna planu).
            <p className="mt-1 text-xs text-neutral-400">
              Najniższa cena z 30 dni przed obniżką: {zlBrutto(listPrice)}.
            </p>
          ) : null}
          {renewalPrice ? (
            <p className="mt-1 text-xs text-neutral-400">
              Odnowienie {interval === 'YEAR' ? 'co rok' : 'co miesiąc'}: {zlBrutto(renewalPrice)} (cena z cennika
              {promoPreview?.appliesToRenewals ? ' z Twoim kodem' : ''}).
            </p>
          ) : null}
          <p className="text-xs text-neutral-500 mt-1">
            {zPaynow
              ? 'Po przejściu do płatności BLIK-iem lub przelewem.'
              : paymentSource === 'WALLET'
                ? 'Kwotę pobierzemy z portfela.'
                : 'Po przejściu na stronę płatności kartą.'}
          </p>
          {paymentSource === 'STRIPE_CARD' ? null : (
            <p className="text-xs text-neutral-500 mt-1">{ZASADA_FAKTUR}</p>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <button
            type="submit"
            disabled={pending}
            aria-disabled={zablokowany || pending}
            aria-describedby={zablokowany ? 'braki-zamowienia' : undefined}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-black transition-all hover:bg-neutral-200 disabled:cursor-not-allowed ${
              zablokowany ? 'opacity-70' : ''
            }`}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending
              ? 'Tworzenie usługi…'
              : domainSel.mode === 'register'
                ? 'Zarejestruj domenę, zamów i opłać'
                : 'Zamów i opłać'}
          </button>
          {zablokowany ? (
            <p
              id="braki-zamowienia"
              role={pokazBraki ? 'alert' : undefined}
              className={`max-w-xs text-xs sm:text-right ${pokazBraki ? 'text-rose-300' : 'text-neutral-400'}`}
            >
              Aby zamówić: {braki.map((b) => b.tekst).join(', ')}.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** P4-2 / P1-05 — parametry hostingu jak na www: limity „do …” (strażnik Z-14), dysk NVMe. */
function HostingParametry({ plan }: { plan: PlanDto }) {
  const vcpu = plan.cpuLimit / 100;
  return (
    <div className="mt-6 space-y-2 text-sm text-neutral-300">
      <Spec icon={<Cpu className="h-4 w-4 text-neutral-400" />} label={`do ${liczba(vcpu, Number.isInteger(vcpu) ? 0 : 1)} vCPU (limit)`} />
      <Spec
        icon={<MemoryStick className="h-4 w-4 text-neutral-400" />}
        label={`do ${liczba(plan.ramLimitMb / 1024, Number.isInteger(plan.ramLimitMb / 1024) ? 0 : 1)} GB RAM (limit)`}
      />
      <Spec
        icon={<HardDrive className="h-4 w-4 text-neutral-400" />}
        label={`${liczba(plan.diskLimitMb / 1024, 0)} GB miejsca NVMe`}
      />
    </div>
  );
}

/** P4-2 — poczta: miejsce, skrzynki i wysyłka zamiast procesora i pamięci, które przy poczcie nic nie mówią. */
function PocztaParametry({ plan }: { plan: PlanDto }) {
  return (
    <div className="mt-6 space-y-2 text-sm text-neutral-300">
      <Spec
        icon={<HardDrive className="h-4 w-4 text-neutral-400" />}
        label={`${liczba(plan.diskLimitMb / 1024, 0)} GB miejsca na pocztę (NVMe)`}
      />
      <Spec icon={<Mail className="h-4 w-4 text-neutral-400" />} label="Skrzynki bez limitu liczby, w ramach miejsca" />
      <Spec
        icon={<Send className="h-4 w-4 text-neutral-400" />}
        label={`Wysyłka do ${liczba(HOSTING_MAIL_DAILY_SEND_LIMIT, 0)} wiadomości na dobę`}
      />
    </div>
  );
}

/** Decyzja 6 (3.11) — limit kosztu autoskalowania w zamówieniu: domyślnie „Bez limitu”, obok „Ustaw własny limit”. */
function LimitAutoskalowania({
  tryb,
  onTryb,
  kwota,
  onKwota,
  blad,
}: {
  tryb: 'bez' | 'wlasny';
  onTryb: (t: 'bez' | 'wlasny') => void;
  kwota: string;
  onKwota: (k: string) => void;
  blad: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <p className="text-sm font-semibold text-white" id="limit-tytul">Limit kosztu dodatkowej mocy</p>
      <div role="group" aria-labelledby="limit-tytul" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            ['bez', 'Bez limitu', 'Płacisz za faktyczne użycie, według cennika.'],
            ['wlasny', 'Ustaw własny limit', 'Po osiągnięciu limitu zasoby wracają do pakietu.'],
          ] as const
        ).map(([v, tytul, opis]) => (
          <button
            key={v}
            type="button"
            aria-pressed={tryb === v}
            onClick={() => onTryb(v)}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${
              tryb === v ? 'border-white bg-white/10 text-white' : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/30'
            }`}
          >
            <span className="block text-sm font-semibold">{tytul}</span>
            <span className="mt-0.5 block text-xs text-neutral-400">{opis}</span>
          </button>
        ))}
      </div>
      {tryb === 'wlasny' ? (
        <label className="mt-3 block">
          <span className="text-xs text-neutral-300">Najwyżej tyle zł brutto w ciągu 30 dni</span>
          <input
            id="limit-autoskalowania"
            type="text"
            inputMode="decimal"
            value={kwota}
            onChange={(e) => onKwota(e.target.value)}
            placeholder="np. 30"
            aria-invalid={blad ? true : undefined}
            aria-describedby={blad ? 'limit-blad' : 'limit-opis'}
            className="mt-1 w-full max-w-[12rem] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
          />
          {blad ? (
            <span id="limit-blad" className="mt-1 block text-xs text-rose-300">{blad}</span>
          ) : (
            <span id="limit-opis" className="mt-1 block text-xs text-neutral-500">
              Liczymy sumę dopłat za dodatkową moc z ostatnich 30 dni. Limit zmienisz też później w panelu usługi.
            </span>
          )}
        </label>
      ) : (
        <p className="mt-3 text-xs text-neutral-400">
          Bez limitu nie ograniczamy kosztu dodatkowej mocy – płacisz za to, czego strona faktycznie użyje. Limit możesz
          ustawić tu albo później w panelu usługi.
        </p>
      )}
    </div>
  );
}

/** Q-05 — limity pakietu Newsletter zamiast zasobów serwera (których ten produkt nie ma). */
function NewsletterLimity({ plan }: { plan: PlanDto }) {
  const kontakty = plan.emmMaxContacts;
  const wysylki = plan.emmMonthlySends;
  return (
    <ul className="mt-6 space-y-2 text-sm text-neutral-300">
      <li>
        {kontakty == null
          ? 'Kontakty bez limitu'
          : `Do ${liczba(kontakty, 0)} ${plForm(kontakty, 'kontaktu', 'kontaktów', 'kontaktów')}`}
      </li>
      <li>
        {wysylki == null
          ? 'Wysyłki bez limitu'
          : `${liczba(wysylki, 0)} ${plForm(wysylki, 'wysyłka', 'wysyłki', 'wysyłek')} miesięcznie`}
      </li>
    </ul>
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
      aria-pressed={active}
      onClick={() => onChange(value)}
      className={`flex items-center justify-between gap-2 rounded-2xl border px-5 py-4 text-left text-base transition-all ${
        active
          ? 'border-white bg-white/10 text-white'
          : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/30'
      }`}
    >
      {label}
      {active ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
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
  value: SposobPlatnosci;
  current: SposobPlatnosci;
  onChange: (next: SposobPlatnosci) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      aria-pressed={active}
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

/** P1-15 — stan przełącznika widać nie tylko po położeniu gałki: wyłączony jest szary i podpisany. */
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
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start justify-between gap-4 rounded-2xl border p-5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
        checked
          ? 'border-white/30 bg-white/[0.06]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20'
      }`}
    >
      <div>
        <div className="font-semibold text-white">{label}</div>
        <div className="text-sm text-neutral-400 mt-1">{description}</div>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          aria-hidden
          className={`relative h-6 w-11 rounded-full border transition-colors ${
            checked ? 'border-emerald-300 bg-emerald-400' : 'border-line-strong bg-raised'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
              checked ? 'left-5 bg-white' : 'left-0.5 bg-muted-foreground'
            }`}
          />
        </span>
        <span aria-hidden className={`text-[11px] font-medium ${checked ? 'text-emerald-300' : 'text-muted-foreground'}`}>
          {checked ? 'Włączone' : 'Wyłączone'}
        </span>
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
        <span className="text-white font-semibold">Aktywna</span>, gdy wszystko będzie gotowe – możesz
        odświeżać stronę usługi.
      </p>
      <Link
        href={`/dashboard/services/${subscriptionId}`}
        className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200"
      >
        Przejdź do usługi
      </Link>
    </div>
  );
}

function ProvisioningSuccess({
  daUsername,
  domain,
  productKind,
}: {
  daUsername: string;
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
            tutaj, w panelu Verris.
          </p>
        </div>
        <ol className="space-y-2 text-sm text-neutral-300">
          <li>1. Skonfiguruj DNS poczty (rekordy <strong>MX, SPF, DKIM</strong>) w zakładce „Domeny &amp; DNS”.</li>
          <li>2. Załóż skrzynki e-mail w zakładce „Poczta” i ustaw hasła.</li>
          <li>3. Zaloguj się do webmaila adresem skrzynki (nie danymi panelu).</li>
        </ol>
        <Link
          href="/dashboard/services"
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200"
        >
          Przejdź do usługi poczty
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/5 p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Usługa uruchomiona</h2>
        <p className="text-neutral-300 mt-1">
          Twoje konto hostingowe dla domeny <strong>{domain}</strong> jest gotowe. Wszystkim – plikami,
          bazami, pocztą, SSL i kopiami – zarządzasz w tym panelu. Konta FTP i klucze SSH dodasz w zakładkach usługi.
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-4 text-sm">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <dt className="text-xs uppercase tracking-widest text-neutral-500">Login konta</dt>
          <dd className="mt-2 font-mono text-white text-base">{daUsername}</dd>
        </div>
      </dl>
      <Link
        href="/dashboard/services"
        className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200"
      >
        Wróć do listy usług
      </Link>
    </div>
  );
}

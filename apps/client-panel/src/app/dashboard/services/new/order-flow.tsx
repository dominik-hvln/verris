'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getTrialEligibilityAction } from './actions';
import { ArrowLeft, Server, Mail, Cpu, ArrowRight, Gift, Check, CreditCard, CalendarClock, Megaphone } from 'lucide-react';
import type { BillingInterval, PlanDto } from '@verris/contracts/klient';
import { NewSubscriptionForm } from './form';
import { TrialCallout } from './trial-callout';
import type { TrialOffer } from '../data';
import { clientFeatures } from '@/lib/client-features';
import { useFlagi } from '@/lib/feature-flags';
import { plForm } from '@/lib/pl';
import { okresWaznosci, zlKredytu } from '@/lib/kredyty-autoskalowania';

/**
 * UX-4 — wybór TYPU usługi w osobnych kaflach (Hosting / Poczta / VPS), zamiast
 * jednej zmieszanej listy. Poczta przestaje być schowana. Po wyborze typu
 * pokazujemy warianty (plany) tego typu + (dla hostingu) atrakcyjny start trial.
 */
export function OrderFlow({
  plans,
  offer: ofertaVerris,
  bezKarty,
  uPartnera,
  paynowDostepny,
  bezKredytowStartowych,
}: {
  plans: PlanDto[];
  offer: TrialOffer;
  bezKarty?: boolean;
  /** Zakup usługi BLIK-iem / przelewem (Paynow). */
  paynowDostepny?: boolean;
  /** Klient aktywnego resellera — bez promocji Verris (kredyty startowe, kody), jak w API (07.10). */
  uPartnera?: boolean;
  /** Klient ma już za sobą zakup — kredyty na autoskalowanie są tylko przy pierwszym (14.10, jak w API). */
  bezKredytowStartowych?: boolean;
}) {
  const offer = uPartnera || bezKredytowStartowych ? { ...ofertaVerris, cardEnabled: false } : ofertaVerris;
  // VPS ukryty do wejścia do sprzedaży (2026-09-23); włącza API per konto (FEATURE_VPS / FEATURE_VPS_TYLKO_KONTA).
  const vps = useFlagi().vps === true;
  // Q-05 — pakiety Newsletter tylko przy włączonej fladze (domyślnie wyłączona, 2026-09-28).
  const emm = clientFeatures.emailMarketing;
  const params = useSearchParams();
  const router = useRouter();
  const type = params.get('type');
  const interval = params.get('interval');
  const promo = uPartnera ? undefined : (params.get('promo') ?? undefined);

  // P2-02 (beta 3.11) — okres trzyma OrderFlow: kafelki „Rok z góry” / „Miesięcznie” i formularz pokazują ten sam
  // wybór (wcześniej kafelek zmieniał tylko adres, a formularz zostawał na poprzednim okresie).
  const [okres, setOkres] = useState<BillingInterval>(interval === 'YEAR' ? 'YEAR' : 'MONTH');

  const hostingPlans = plans.filter((p) => p.productKind === 'HOSTING');
  // P1-02 — o darmowej próbie mówimy tylko wtedy, gdy jest włączona i któryś plan ją ma (trialDays > 0).
  const probaDostepna = ofertaVerris.freeEnabled && hostingPlans.some((p) => p.trialDays > 0);
  const emailPlans = plans.filter((p) => p.productKind === 'EMAIL');
  const newsletterPlans = emm ? plans.filter((p) => p.productKind === 'EMAIL_MARKETING') : [];

  // --- Krok 2: wybrany typ ---
  if (type === 'hosting' || type === 'email' || (type === 'newsletter' && emm)) {
    const typed = type === 'hosting' ? hostingPlans : type === 'email' ? emailPlans : newsletterPlans;
    const title = type === 'hosting' ? 'Hosting WWW' : type === 'email' ? 'Poczta e-mail' : 'E-mail marketing';
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/dashboard/services/new')}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Zmień typ usługi
        </button>
        <h2 className="text-xl font-bold text-white">{title} — wybierz wariant</h2>
        {typed.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-neutral-400">
            Brak dostępnych wariantów {title.toLowerCase()}. Spróbuj później.
          </div>
        ) : (
          <>
            {type === 'hosting' ? (
              <StartChooser
                offer={offer}
                trialPlansExist={typed.some((p) => p.trialDays > 0)}
                okres={okres}
                onWybierz={setOkres}
              />
            ) : null}
            {type === 'hosting' && offer.freeEnabled ? (
              <div id="trial">
                <TrialCallout plans={typed} />
              </div>
            ) : null}
            <div id="checkout">
              <NewSubscriptionForm
                plans={typed}
                interval={okres}
                onIntervalChange={setOkres}
                initialPromo={promo}
                bezKarty={bezKarty}
                bezKodu={uPartnera}
                paynowDostepny={paynowDostepny}
                // Decyzja 6.11.2026 — przy pierwszym zakupie hostingu (z portfela) API zapisuje kredyty na autoskalowanie;
                // klient widzi korzyść przed zapłatą. Cena pierwszego okresu = cena odnowienia.
                kredytyStartowe={
                  type === 'hosting' && offer.cardEnabled
                    ? {
                        rok: offer.annualAutoscalingCredit,
                        miesiac: offer.monthlyAutoscalingCredit,
                        waznoscMiesiecy: offer.autoscalingCreditValidityMonths ?? 12,
                      }
                    : undefined
                }
              />
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Krok 2b: VPS — spójny krok z powrotem (zamiast wyskoku do innej sekcji) ---
  if (type === 'vps' && vps) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/dashboard/services/new')}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Zmień typ usługi
        </button>
        <h2 className="text-xl font-bold text-white">VPS / Cloud</h2>
        <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/15 text-violet-300">
              <Cpu className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-neutral-300">
                Serwery VPS uruchamiane w chmurze — pełen root przez SSH, skalowalne zasoby,
                rozliczenie miesięczne z portfela. Zarządzanie cyklem życia (start/stop/reinstalacja)
                i kluczami SSH odbywa się w dedykowanej sekcji VPS.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/dashboard/vps"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
                >
                  Otwórz sekcję VPS / Cloud <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/dashboard/services"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                >
                  Wróć do moich usług
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Krok 1: wybór typu usługi ---
  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-400">Co chcesz uruchomić? Wybierz rodzaj usługi.</p>
      <div className={`grid gap-4 ${vps && emm ? 'md:grid-cols-2 xl:grid-cols-4' : vps || emm ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        <ProductCard
          icon={<Server className="h-6 w-6" />}
          title="Hosting WWW"
          desc={probaDostepna ? 'Strony, sklepy, WordPress. Z darmowym okresem próbnym.' : 'Strony, sklepy, WordPress.'}
          bullets={['Autoskalowanie', 'SSL i zapora przed atakami w cenie', 'Tryb EKO']}
          badge="Najpopularniejsze"
          href="/dashboard/services/new?type=hosting"
          count={hostingPlans.length}
          accent="emerald"
          prezent={probaDostepna}
        />
        <ProductCard
          icon={<Mail className="h-6 w-6" />}
          title="Poczta e-mail"
          desc="Profesjonalna poczta w Twojej domenie, bez hostingu WWW."
          bullets={['Poczta w przeglądarce i w programie pocztowym', 'Filtr antyspamowy', 'Wysoka dostarczalność']}
          href="/dashboard/services/new?type=email"
          count={emailPlans.length}
          accent="sky"
        />
        {emm ? (
          <ProductCard
            icon={<Megaphone className="h-6 w-6" />}
            title="E-mail marketing"
            desc="Newslettery do własnej listy odbiorców, prosto z panelu. Bez domeny i serwera."
            bullets={['Zapis z potwierdzeniem (double opt-in)', 'Wypis jednym kliknięciem', 'Kampanie z panelu']}
            href="/dashboard/services/new?type=newsletter"
            count={newsletterPlans.length}
            accent="fuchsia"
          />
        ) : null}
        {vps ? (
          <ProductCard
            icon={<Cpu className="h-6 w-6" />}
            title="VPS / Cloud"
            desc="Własny serwer z dostępem root. Rozliczenie miesięczne."
            bullets={['Pełny root + SSH', 'Skalowalne zasoby', 'Snapshoty']}
            href="/dashboard/services/new?type=vps"
            accent="violet"
          />
        ) : null}
      </div>
    </div>
  );
}

/** UX-3 — „Jak chcesz zacząć?" — darmowy trial vs zakup od razu (z kredytami na autoskalowanie przy pierwszym). */
function StartChooser({
  offer,
  trialPlansExist,
  okres,
  onWybierz,
}: {
  offer: TrialOffer;
  trialPlansExist: boolean;
  okres: BillingInterval;
  onWybierz: (iv: BillingInterval) => void;
}) {
  // Darmowy trial pokazujemy TYLKO gdy realnie dostępny: włączony w ofercie,
  // istnieje plan z trialem ORAZ konto jest jeszcze uprawnione (1 trial/konto).
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);
  useEffect(() => {
    // Bez oferty trialu `showFree` i tak jest fałszem — nie ma czego ustawiać.
    if (!offer.freeEnabled || !trialPlansExist) return;
    void getTrialEligibilityAction()
      .then((r) => setTrialEligible(r.eligible))
      .catch(() => setTrialEligible(false));
  }, [offer.freeEnabled, trialPlansExist]);

  const showFree = offer.freeEnabled && trialPlansExist && trialEligible === true;
  if (!offer.cardEnabled && !showFree) return null;
  // Gdy tylko ścieżka darmowa (bez karty) — TrialCallout sam ją pokaże; chooser zbędny.
  if (!offer.cardEnabled) return null;

  // Decyzja 6.11.2026 — kafelek ustawia tylko okres (ten sam stan co w formularzu — P2-02); kredyty zapisze API.
  const goCard = (iv: BillingInterval) => {
    onWybierz(iv);
    setTimeout(() => document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' }), 60);
  };
  const waznosc = okresWaznosci(offer.autoscalingCreditValidityMonths ?? 12);
  const kafel = (kwota: number) =>
    kwota > 0 ? (
      <>
        <strong className="text-white">+{zlKredytu(kwota)}</strong> na autoskalowanie, ważne {waznosc}.
      </>
    ) : (
      'Cena z cennika.'
    );

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-sm font-bold text-white">Jak chcesz zacząć?</h3>
      <p className="mt-1 text-xs text-neutral-400">
        {showFree ? 'Wypróbuj bez zobowiązań albo zamów od razu. ' : ''}
        Przy pierwszym zakupie dostajesz darmowe kredyty na autoskalowanie — opłacą dodatkową moc w szczycie ruchu.
        Pierwszy okres kosztuje tyle co odnowienie: cena z cennika, podana przy zamówieniu.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {showFree ? (
          <button
            type="button"
            onClick={() => document.getElementById('trial')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4 text-left transition-colors hover:bg-emerald-400/10"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Gift className="h-4 w-4 text-emerald-300" /> Darmowy okres próbny
            </span>
            <span className="mt-1 text-xs text-emerald-100/80">Bez karty. Zero ryzyka.</span>
            <span className="mt-3 text-[11px] font-medium text-emerald-300">Wybierz plan próbny →</span>
          </button>
        ) : null}

        <button
          type="button"
          aria-pressed={okres === 'YEAR'}
          onClick={() => goCard('YEAR')}
          className="relative flex flex-col rounded-2xl border border-sky-400/30 bg-sky-400/[0.06] p-4 text-left transition-colors hover:bg-sky-400/10"
        >
          <span className="absolute right-3 top-3 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
            Najtaniej
          </span>
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <CalendarClock className="h-4 w-4 text-sky-300" /> Rok z góry
          </span>
          <span className="mt-1 text-xs text-sky-100/80">
            Niższa cena roczna. {kafel(offer.annualAutoscalingCredit)}
          </span>
          <span className="mt-3 text-[11px] font-medium text-sky-300">Wybierz →</span>
        </button>

        <button
          type="button"
          aria-pressed={okres === 'MONTH'}
          onClick={() => goCard('MONTH')}
          className="flex flex-col rounded-2xl border border-white/15 bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.06]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <CreditCard className="h-4 w-4 text-neutral-300" /> Miesięcznie
          </span>
          <span className="mt-1 text-xs text-neutral-400">{kafel(offer.monthlyAutoscalingCredit)}</span>
          <span className="mt-3 text-[11px] font-medium text-neutral-300">Wybierz →</span>
        </button>
      </div>
    </div>
  );
}

function ProductCard({
  icon,
  title,
  desc,
  bullets,
  badge,
  href,
  count,
  accent,
  external,
  prezent = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  bullets: string[];
  badge?: string;
  href: string;
  count?: number;
  accent: 'emerald' | 'sky' | 'violet' | 'fuchsia';
  external?: boolean;
  /** Ikona prezentu tylko przy dostępnej darmowej próbie (P1-02). */
  prezent?: boolean;
}) {
  const ring: Record<string, string> = {
    emerald: 'hover:border-emerald-400/40 hover:shadow-[0_0_40px_rgba(16,185,129,0.12)]',
    sky: 'hover:border-sky-400/40 hover:shadow-[0_0_40px_rgba(56,189,248,0.12)]',
    violet: 'hover:border-violet-400/40 hover:shadow-[0_0_40px_rgba(139,92,246,0.12)]',
    fuchsia: 'hover:border-fuchsia-400/40 hover:shadow-[0_0_40px_rgba(217,70,239,0.12)]',
  };
  const iconBg: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    sky: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
    fuchsia: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30',
  };
  return (
    <Link
      href={href}
      className={`group relative flex flex-col rounded-[24px] border border-white/10 bg-[#0a0a0a] p-6 transition-all duration-300 hover:-translate-y-0.5 ${ring[accent]}`}
    >
      {badge ? (
        <span className="absolute right-4 top-4 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
          {badge}
        </span>
      ) : null}
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${iconBg[accent]}`}>
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm text-neutral-400">{desc}</p>
      <ul className="mt-4 space-y-1.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-xs text-neutral-300">
            <Check className="h-3.5 w-3.5 shrink-0 text-neutral-500" /> {b}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
        <span className="text-xs text-neutral-500">
          {external
            ? 'Przejdź do VPS'
            : count && count > 0
              ? `${count} ${plForm(count, 'wariant', 'warianty', 'wariantów')}`
              : 'Sprawdź warianty'}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-white">
          {prezent ? (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <Gift className="h-3.5 w-3.5" /> Wybierz
            </span>
          ) : (
            'Wybierz'
          )}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

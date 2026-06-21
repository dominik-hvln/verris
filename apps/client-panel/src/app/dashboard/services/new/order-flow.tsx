'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Server, Mail, Cpu, ArrowRight, Gift, Check, CreditCard, CalendarClock } from 'lucide-react';
import type { BillingInterval, PlanDto } from '@verris/contracts';
import { NewSubscriptionForm } from './form';
import { TrialCallout } from './trial-callout';
import type { TrialOffer } from '../data';

/**
 * UX-4 — wybór TYPU usługi w osobnych kaflach (Hosting / Poczta / VPS), zamiast
 * jednej zmieszanej listy. Poczta przestaje być schowana. Po wyborze typu
 * pokazujemy warianty (plany) tego typu + (dla hostingu) atrakcyjny start trial.
 */
export function OrderFlow({ plans, offer }: { plans: PlanDto[]; offer: TrialOffer }) {
  const params = useSearchParams();
  const router = useRouter();
  const type = params.get('type');
  const interval = params.get('interval');
  const promo = params.get('promo') ?? undefined;

  const hostingPlans = plans.filter((p) => p.productKind === 'HOSTING');
  const emailPlans = plans.filter((p) => p.productKind === 'EMAIL');

  // --- Krok 2: wybrany typ ---
  if (type === 'hosting' || type === 'email') {
    const typed = type === 'hosting' ? hostingPlans : emailPlans;
    const title = type === 'hosting' ? 'Hosting WWW' : 'Poczta e-mail';
    const initialInterval: BillingInterval | undefined =
      interval === 'YEAR' ? 'YEAR' : interval === 'MONTH' ? 'MONTH' : undefined;
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
              <StartChooser offer={offer} />
            ) : null}
            {type === 'hosting' && offer.freeEnabled ? (
              <div id="trial">
                <TrialCallout plans={typed} />
              </div>
            ) : null}
            <div id="checkout">
              <NewSubscriptionForm plans={typed} initialInterval={initialInterval} initialPromo={promo} />
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Krok 1: wybór typu usługi ---
  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-400">Co chcesz uruchomić? Wybierz rodzaj usługi.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <ProductCard
          icon={<Server className="h-6 w-6" />}
          title="Hosting WWW"
          desc="Strony, sklepy, WordPress. Z darmowym okresem próbnym."
          bullets={['Autoskalowanie', 'SSL i WAF w cenie', 'Tryb EKO']}
          badge="Najpopularniejsze"
          href="/dashboard/services/new?type=hosting"
          count={hostingPlans.length}
          accent="emerald"
        />
        <ProductCard
          icon={<Mail className="h-6 w-6" />}
          title="Poczta e-mail"
          desc="Profesjonalna poczta w Twojej domenie, bez hostingu WWW."
          bullets={['Webmail i IMAP/SMTP', 'Antyspam', 'Wysoka dostarczalność']}
          href="/dashboard/services/new?type=email"
          count={emailPlans.length}
          accent="sky"
        />
        <ProductCard
          icon={<Cpu className="h-6 w-6" />}
          title="VPS / Cloud"
          desc="Własny serwer z dostępem root. Rozliczenie miesięczne."
          bullets={['Pełny root + SSH', 'Skalowalne zasoby', 'Snapshoty']}
          href="/dashboard/vps"
          accent="violet"
          external
        />
      </div>
    </div>
  );
}

/** UX-3 — „Jak chcesz zacząć?" — darmowy trial vs ścieżka z kartą + rabat. */
function StartChooser({ offer }: { offer: TrialOffer }) {
  const router = useRouter();
  if (!offer.cardEnabled && !offer.freeEnabled) return null;
  // Gdy tylko jedna ścieżka — nie pokazuj choosera (zbędny szum).
  if (!offer.cardEnabled) return null;

  const goCard = (iv: 'YEAR' | 'MONTH', code: string) => {
    const q = new URLSearchParams({ type: 'hosting', interval: iv });
    if (code) q.set('promo', code);
    router.push(`/dashboard/services/new?${q.toString()}`);
    setTimeout(() => document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-sm font-bold text-white">Jak chcesz zacząć?</h3>
      <p className="mt-1 text-xs text-neutral-400">
        Wypróbuj bez zobowiązań albo od razu z kartą i rabatem na pierwszy rok.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {offer.freeEnabled ? (
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
          onClick={() => goCard('YEAR', offer.annualPromoCode)}
          className="relative flex flex-col rounded-2xl border border-sky-400/30 bg-sky-400/[0.06] p-4 text-left transition-colors hover:bg-sky-400/10"
        >
          <span className="absolute right-3 top-3 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
            Najtaniej
          </span>
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <CalendarClock className="h-4 w-4 text-sky-300" /> Rok z góry
          </span>
          <span className="mt-1 text-xs text-sky-100/80">
            Rabat <strong className="text-white">−{offer.annualDiscountPct}%</strong> na pierwszy rok.
          </span>
          <span className="mt-3 text-[11px] font-medium text-sky-300">Wybierz z kartą →</span>
        </button>

        <button
          type="button"
          onClick={() => goCard('MONTH', offer.monthlyPromoCode)}
          className="flex flex-col rounded-2xl border border-white/15 bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.06]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <CreditCard className="h-4 w-4 text-neutral-300" /> Miesięcznie
          </span>
          <span className="mt-1 text-xs text-neutral-400">
            Rabat <strong className="text-white">−{offer.monthlyDiscountPct}%</strong> przez pierwszy rok. Karta wymagana.
          </span>
          <span className="mt-3 text-[11px] font-medium text-neutral-300">Wybierz z kartą →</span>
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
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  bullets: string[];
  badge?: string;
  href: string;
  count?: number;
  accent: 'emerald' | 'sky' | 'violet';
  external?: boolean;
}) {
  const ring: Record<string, string> = {
    emerald: 'hover:border-emerald-400/40 hover:shadow-[0_0_40px_rgba(16,185,129,0.12)]',
    sky: 'hover:border-sky-400/40 hover:shadow-[0_0_40px_rgba(56,189,248,0.12)]',
    violet: 'hover:border-violet-400/40 hover:shadow-[0_0_40px_rgba(139,92,246,0.12)]',
  };
  const iconBg: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    sky: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
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
              ? `${count} ${count === 1 ? 'wariant' : 'warianty/ów'}`
              : 'Sprawdź warianty'}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-white">
          {title === 'Hosting WWW' ? (
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

import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Database,
  Globe,
  HelpCircle,
  Leaf,
  Server,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { SpinBorder } from '@/components/spin-border';
import { CREDIT_RATE_INFO, formatCredits } from '@/lib/credits';
import { clientFeatures } from '@/lib/client-features';
import { DashboardCharts } from './dashboard-charts';
import type { DashboardSnapshot } from './dashboard-data';

export function DashboardHome({ snapshot }: { snapshot: DashboardSnapshot }) {
  const firstName = snapshot.profile?.firstName || 'Użytkowniku';
  const servicesList = snapshot.services;
  const domainsList = snapshot.domains;
  const hasErrors = Boolean(snapshot.errors.services || snapshot.errors.domains);
  const activeServices = servicesList.filter((s) => s.status === 'ACTIVE' && s.account).length;
  const autoscalingCount = servicesList.filter((s) => s.autoscalingEnabled).length;
  const ecoPoints = snapshot.profile?.ecoPoints ?? snapshot.ecoProgram?.ecoPoints ?? 0;

  return (
    <div className="space-y-8 pb-10">
      <div className="relative overflow-hidden rounded-[32px] p-px group">
        <SpinBorder variant="emerald" className="opacity-30" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 rounded-[calc(32px-1px)] bg-[#050505] p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-emerald-400/90">
              <Sparkles className="h-4 w-4" aria-hidden />
              {getGreeting()}
            </div>
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Witaj, {firstName}!
            </h1>
            <p className="max-w-lg text-sm text-neutral-400 sm:text-base">
              Przegląd konta: usługi, domeny i portfel.
              {clientFeatures.eco ? ' Program EKO jest dostępny w menu.' : ''} Szczegóły hostingu i zużycia
              zasobów znajdziesz w panelu hostingu oraz w widoku pojedynczej usługi.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/dashboard/services/new"
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Nowa usługa
            </Link>
            <Link
              href="/dashboard/services"
              className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Moje usługi
            </Link>
          </div>
        </div>
      </div>

      {hasErrors ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/5 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold text-rose-100">Część danych jest chwilowo niedostępna</p>
            {snapshot.errors.services ? <p>Usługi: {snapshot.errors.services}</p> : null}
            {snapshot.errors.domains ? <p>Domeny: {snapshot.errors.domains}</p> : null}
          </div>
        </div>
      ) : null}

      <div
        className={`grid gap-4 sm:grid-cols-2 ${clientFeatures.eco ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
      >
        <StatCard label="Saldo portfela" value={formatCredits(snapshot.profile?.walletBalance ?? 0)} description={CREDIT_RATE_INFO} icon={Wallet} />
        <StatCard
          label="Usługi aktywne"
          value={snapshot.errors.services ? '—' : String(activeServices)}
          description={
            snapshot.errors.services
              ? 'Błąd pobierania'
              : servicesList.length === 0
                ? 'Zamów pierwszą usługę'
                : `Łącznie ${servicesList.length} w systemie`
          }
          icon={Server}
        />
        <StatCard
          label="Domeny"
          value={snapshot.errors.domains ? '—' : String(domainsList.length)}
          description={snapshot.errors.domains ? 'Błąd pobierania' : 'W Twoim portfelu'}
          icon={Globe}
        />
        {clientFeatures.eco ? (
          <StatCard
            label="Punkty EKO"
            value={String(ecoPoints)}
            description={
              snapshot.ecoProgram?.isEcoProgramParticipant
                ? 'Program aktywny'
                : 'Zbieraj punkty w Programie EKO'
            }
            icon={Leaf}
            accent
          />
        ) : null}
        <StatCard
          label="Otwarte zgłoszenia"
          value={String(snapshot.openTickets)}
          description="W Centrum Pomocy"
          icon={HelpCircle}
        />
      </div>

      <DashboardCharts snapshot={snapshot} showEco={clientFeatures.eco} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 mt-2 text-xl font-bold text-white">Szybkie akcje</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {clientFeatures.eco ? (
              <QuickAction
                title="Program EKO"
                description="Punkty, badge i wymiana na kredyty"
                href="/dashboard/eco"
                icon={Leaf}
                accent
              />
            ) : null}
            <QuickAction title="Zarządzaj domenami" description="DNS i przypisanie do usług" href="/dashboard/domains" icon={Globe} />
            <QuickAction title="Portfel i płatności" description="Doładuj kredyty (K) i faktury" href="/dashboard/billing" icon={CreditCard} />
            <QuickAction title="Certyfikaty SSL" description="Let&apos;s Encrypt na usługach" href="/dashboard/ssl" icon={ShieldCheck} />
            <QuickAction title="Bazy danych" description="MySQL na hostingu" href="/dashboard/databases" icon={Database} />
            <QuickAction title="Wsparcie" description="Zgłoszenia i odpowiedzi BOK" href="/dashboard/support" icon={HelpCircle} />
          </div>
        </div>

        <div>
          <h2 className="mb-4 mt-2 text-xl font-bold text-white">Hosting</h2>
          <div className="space-y-4 rounded-[24px] border border-white/10 bg-[#0a0a0a] p-5 text-sm text-neutral-400 leading-relaxed">
            <p>
              <span className="text-white font-medium">Autoskalowanie:</span>{' '}
              {snapshot.errors.services ? '—' : `${autoscalingCount} usług`}
            </p>
            <p>
              <span className="text-white font-medium">Tryb EKO na usłudze:</span>{' '}
              {snapshot.ecoProgram?.hasEcoModeOnActiveService
                ? `włączony (${snapshot.ecoProgram.ecoModeOnActiveServices})`
                : 'wyłączony'}
            </p>
            {snapshot.ecoProgram?.referralProgramApproved ? (
              <p>
                <span className="text-white font-medium">Program partnerski:</span> aktywny —{' '}
                <Link href="/dashboard/referral" className="text-emerald-400 underline hover:text-emerald-300">
                  link polecający
                </Link>
              </p>
            ) : null}
            <Link
              href="/dashboard/services"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Szczegóły usług <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[24px] p-px transition-transform duration-300 hover:-translate-y-0.5">
      <SpinBorder variant={accent ? 'emerald' : 'white'} className={accent ? 'opacity-35' : 'opacity-15'} />
      <div className="relative z-10 flex h-full flex-col justify-between rounded-[calc(24px-1px)] bg-[#0a0a0a] p-5 transition-colors group-hover:bg-[#0c0c0c]">
        <div className="mb-4 flex items-start justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-xl border ${
              accent ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-[11px] font-medium text-neutral-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
  icon: Icon,
  accent,
}: {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-4 overflow-hidden rounded-[24px] p-px transition-transform duration-300 hover:-translate-y-0.5"
    >
      <SpinBorder variant={accent ? 'emerald' : 'white'} className="opacity-15 group-hover:opacity-40" />
      <div className="relative z-10 flex flex-1 items-start gap-4 rounded-[calc(24px-1px)] bg-[#0a0a0a] p-5 group-hover:bg-[#121212]">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
            accent ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-white/10 bg-white/5'
          }`}
        >
          <Icon className={`h-5 w-5 ${accent ? 'text-emerald-400' : 'text-white'}`} />
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <p className="flex items-center gap-2 text-sm font-bold text-white">
            {title}
            <ArrowRight className="h-3.5 w-3.5 text-neutral-500 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-emerald-400" />
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Dobry wieczór';
  if (hour < 12) return 'Dzień dobry';
  if (hour < 18) return 'Dzień dobry';
  return 'Dobry wieczór';
}

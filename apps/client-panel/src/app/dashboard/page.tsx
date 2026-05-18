"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Globe,
  Wallet,
  HelpCircle,
  Database,
  ShieldCheck,
  Mail,
  CreditCard,
  ArrowRight,
  Loader2,
  Sparkles,
  Server,
} from "lucide-react";
import { fetchUserProfile, type UserProfile } from "./settings/actions";
import {
  fetchUserDomainsPortfolio,
  fetchUserServicesSummary,
} from "./dashboard-data";
import type { DomainDto, ServiceSummaryDto } from "@verris/contracts";
import { CREDIT_RATE_INFO, formatCredits } from "@/lib/credits";

/* ────────────────────────── Main Dashboard ────────────────────────── */

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [services, setServices] = useState<ServiceSummaryDto[] | null>(null);
  const [domains, setDomains] = useState<DomainDto[] | null>(null);
  const [errors, setErrors] = useState<{ services?: string; domains?: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchUserProfile(),
      fetchUserServicesSummary(),
      fetchUserDomainsPortfolio(),
    ]).then(([p, svc, dom]) => {
      setProfile(p);
      const nextErrors: { services?: string; domains?: string } = {};
      if (svc.ok) {
        setServices(svc.data);
      } else {
        setServices(null);
        nextErrors.services = svc.error;
      }
      if (dom.ok) {
        setDomains(dom.data);
      } else {
        setDomains(null);
        nextErrors.domains = dom.error;
      }
      setErrors(nextErrors);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const greeting = getGreeting();
  const firstName = profile?.firstName || "Użytkowniku";
  const servicesList = services ?? [];
  const domainsList = domains ?? [];
  const hasErrors = Boolean(errors.services || errors.domains);

  return (
    <div className="space-y-8 pb-10">
      {/* ─── Hero Greeting ─── */}
      <div className="relative overflow-hidden rounded-[32px] p-px group">
        <div className="absolute -inset-full animate-[spin_1.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_70%,#ffffff_100%)] opacity-20 pointer-events-none" />
        <div className="relative bg-[#050505] p-10 rounded-[calc(32px-1px)] z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-400 mb-2">
              <Sparkles className="h-4 w-4 text-neutral-300" />
              {greeting}
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">
              Witaj, {firstName}! 
            </h1>
            <p className="text-neutral-400 max-w-lg">
              Przegląd konta: usługi hostingowe, domeny w portfelu i saldo. Szczegółowe zużycie LVE i pliki znajdziesz w
              DirectAdmin oraz w sekcji usługi.
            </p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/dashboard/services"
              className="px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors"
            >
              Uruchom instancję
            </Link>
          </div>
        </div>
      </div>

      <div className="relative rounded-[32px] p-px overflow-hidden">
        <div className="absolute -inset-[200%] animate-[spin_1.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_70%,#ffffff_100%)] opacity-10 pointer-events-none" />
        <div className="relative bg-[#050505] p-8 rounded-[calc(32px-1px)] z-10">
          <h2 className="text-xl font-bold text-white mb-2">Metryki sieciowe i obciążenie</h2>
          <p className="text-sm text-neutral-400 max-w-2xl leading-relaxed">
            Zagregowany wykres ruchu nie jest jeszcze dostępny w panelu klienta. Zużycie CPU/RAM/IO dla Twojego konta
            CloudLinux (LVE) zobaczysz w DirectAdmin; przy włączonym autoskalowaniu historię znajdziesz też w szczegółach
            usługi.
          </p>
        </div>
      </div>

      {hasErrors ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/5 p-4 text-sm text-rose-200">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-rose-300" />
          <div className="space-y-1">
            <p className="font-semibold text-rose-100">
              Część danych nie jest dostępna w tej chwili
            </p>
            {errors.services ? (
              <p>
                Usługi hostingowe: <span className="text-rose-100">{errors.services}</span>
              </p>
            ) : null}
            {errors.domains ? (
              <p>
                Domeny: <span className="text-rose-100">{errors.domains}</span>
              </p>
            ) : null}
            <p className="text-rose-200/70">
              Odśwież stronę za chwilę. Jeśli problem się powtórzy, otwórz zgłoszenie w Centrum
              Pomocy.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Saldo portfela"
          value={formatCredits(profile?.walletBalance ?? 0)}
          description={CREDIT_RATE_INFO}
          icon={Wallet}
        />
        <StatCard
          label="Usługi hostingowe"
          value={
            services === null
              ? "—"
              : `${servicesList.filter((s) => s.status === "ACTIVE" && s.account).length} aktywnych`
          }
          description={
            services === null
              ? "Nie udało się pobrać listy"
              : servicesList.length === 0
                ? "Brak subskrypcji — zamów usługę"
                : `Łącznie ${servicesList.length} w systemie`
          }
          icon={Server}
        />
        <StatCard
          label="Domeny w portfelu"
          value={domains === null ? "—" : `${domainsList.length}`}
          description={
            domains === null
              ? "Nie udało się pobrać listy"
              : "Rejestr domen (weryfikacja DNS)"
          }
          icon={Globe}
        />
        <StatCard
          label="Autoskalowanie"
          value={
            services === null
              ? "—"
              : `${servicesList.filter((s) => s.autoscalingEnabled).length} włączonych`
          }
          description={
            services === null
              ? "Nie udało się pobrać listy"
              : "Z usług z aktywnym autoscaling"
          }
          icon={Activity}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* ─── Quick Actions ─── */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4 mt-2">
            <h2 className="text-xl font-bold text-white">Szybkie akcje</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 text-white">
            <QuickAction
              title="Zarządzaj domenami"
              description="Podepnij nową lub edytuj istniejące domeny"
              href="/dashboard/domains"
              icon={Globe}
            />
            <QuickAction
              title="Bazy danych"
              description="MySQL na koncie DirectAdmin"
              href="/dashboard/databases"
              icon={Database}
            />
            <QuickAction
              title="Certyfikaty SSL"
              description="Zainstaluj darmowy Let's Encrypt na usługach"
              href="/dashboard/ssl"
              icon={ShieldCheck}
            />
            <QuickAction
              title="Konta E-mail"
              description="Zarządzaj profesjonalnymi skrzynkami pocztowymi"
              href="/dashboard/email"
              icon={Mail}
            />
            <QuickAction
              title="Portfel Płatności"
              description="Doładuj konto lub zmień metody płatności"
              href="/dashboard/billing"
              icon={CreditCard}
            />
            <QuickAction
              title="Wsparcie premium"
              description="Skontaktuj się ze specjalistami technicznymi"
              href="/dashboard/support"
              icon={HelpCircle}
            />
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-4 mt-2">
            <h2 className="text-xl font-bold text-white">Limity planu</h2>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-[#0a0a0a] p-5 text-sm text-neutral-400 leading-relaxed">
            <p>
              Przydział RAM, dysku i CPU pochodzi z wybranego planu. Aktualne limity oraz zużycie LVE są widoczne w
              szczegółach usługi i w panelu DirectAdmin — tutaj nie wyświetlamy zastępczych wartości procentowych.
            </p>
            <Link
              href="/dashboard/services"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-white hover:underline"
            >
              Moje usługi <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

      </div>
      
    </div>
  );
}

/* ──────────────────── Components ──────────────────── */

function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: any;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[24px] p-px hover:-translate-y-1 transition-transform duration-300">
      <div className="absolute -inset-full animate-[spin_1.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_70%,#ffffff_100%)] opacity-20 pointer-events-none transition-opacity duration-[1500ms] pointer-events-none" />
      <div className="relative flex flex-col justify-between rounded-[calc(24px-1px)] bg-[#0a0a0a] p-5 h-full z-10 transition-colors duration-300 group-hover:bg-[#121212]">
        <div className="flex items-start justify-between mb-4">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
            {label}
          </p>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white transition-colors duration-300 group-hover:bg-white/10">
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
}: {
  title: string;
  description: string;
  href: string;
  icon: any;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-4 rounded-[24px] p-px transition-transform duration-300 hover:-translate-y-1 overflow-hidden"
    >
      <div className="absolute -inset-full animate-[spin_1.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_70%,#ffffff_100%)] opacity-20 pointer-events-none transition-opacity duration-[1500ms] pointer-events-none" />
      <div className="flex-1 flex items-start gap-4 rounded-[calc(24px-1px)] bg-[#0a0a0a] p-5 z-10 transition-colors duration-300 group-hover:bg-[#121212]">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white transition-colors">
              {title}
            </p>
            <ArrowRight className="h-3.5 w-3.5 text-neutral-500 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 group-hover:text-white" />
          </div>
          <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </Link>
  );
}

/* ──────────────────── Helpers ──────────────────── */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Wczesne godziny operacyjne";
  if (hour < 12) return "Początek dnia. System gotowy";
  if (hour < 18) return "Aktywność w normie";
  return "System w stanie spoczynku";
}

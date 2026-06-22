'use client';

import React, { useEffect, useState } from 'react';
import {
  Server,
  Globe,
  Database,
  Mail,
  Shield,
  Box,
  ArrowLeft,
  Rocket,
  FolderOpen,
  Activity,
  LayoutDashboard,
  Gauge,
  ArrowRightLeft,
  Receipt,
  Terminal,
  Clock,
  FolderKanban,
  Archive,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import DomainsTab from '@/components/hosting/DomainsTab';
import DatabasesTab from '@/components/hosting/DatabasesTab';
import MailTab from '@/components/hosting/MailTab';
import SSLTab from '@/components/hosting/SSLTab';
import StagingTab from '@/components/hosting/StagingTab';
import WafTab from '@/components/hosting/WafTab';
import MonitoringTab from '@/components/hosting/MonitoringTab';
import DeployTab from '@/components/hosting/DeployTab';
import { FileManagerClient } from '@/app/dashboard/file-manager/file-manager-client';
import AppsTab from '@/components/hosting/AppsTab';
import PhpTab from '@/components/hosting/PhpTab';
import FtpTab from '@/components/hosting/FtpTab';
import CronTab from '@/components/hosting/CronTab';
import BackupsTab from '@/components/hosting/BackupsTab';
import UsageTab from '@/components/hosting/UsageTab';
import ServiceOverviewTab from '@/components/hosting/ServiceOverviewTab';
import ServiceSubscriptionTab from '@/components/hosting/ServiceSubscriptionTab';
import HostingPanelCard from '@/components/hosting/HostingPanelCard';
import ServiceConnectionCard from '@/components/hosting/ServiceConnectionCard';
import { HostingLinksProvider } from '@/components/hosting/hosting-links-context';
import { MobileTabStrip } from '@/components/panel';
import { fetchServiceDetailsAction } from '@/app/dashboard/services/[id]/hosting-service-actions';

const TABS = [
  { id: 'overview', label: 'Przegląd', icon: LayoutDashboard },
  { id: 'subscription', label: 'Subskrypcja', icon: Receipt },
  { id: 'domains', label: 'Domeny & DNS', icon: Globe },
  { id: 'databases', label: 'Bazy MySQL', icon: Database },
  { id: 'mail', label: 'Poczta', icon: Mail },
  { id: 'files', label: 'Pliki', icon: FolderOpen },
  { id: 'php', label: 'Wersja PHP', icon: Terminal },
  { id: 'ssl', label: 'SSL', icon: Shield },
  { id: 'apps', label: 'Aplikacje', icon: Globe },
  { id: 'ftp', label: 'Konta FTP', icon: FolderKanban },
  { id: 'cron', label: 'Cron', icon: Clock },
  { id: 'backups', label: 'Kopie zapasowe', icon: Archive },
  { id: 'waf', label: 'WAF', icon: Shield },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
  { id: 'staging', label: 'Staging', icon: Box },
  { id: 'deploy', label: 'Deploy', icon: Rocket },
  { id: 'usage', label: 'Usage', icon: Activity },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function HostingManagerPage() {
  const params = useParams() as { id: string };
  const searchParams = useSearchParams();
  // Pozwala wejść prosto w konkretną zakładkę (np. ze starych tras / linków):
  // /dashboard/services/<id>?tab=files
  const initialTab = ((): TabId => {
    const t = searchParams.get('tab');
    return t && TABS.some((tab) => tab.id === t) ? (t as TabId) : 'overview';
  })();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // P-1b — usługa POCZTY nie ma hostingu WWW: pokazujemy tylko zakładki istotne
  // dla poczty. productKind pobieramy raz; do czasu odpowiedzi zakładamy HOSTING
  // (pełny zestaw), więc nic nie miga dla typowych usług.
  const [productKind, setProductKind] = useState<'HOSTING' | 'EMAIL'>('HOSTING');
  // Dopóki nie znamy typu usługi, NIE pokazujemy pełnego (hostingowego) zestawu
  // zakładek — inaczej dla poczty migają na sekundę wszystkie zakładki hostingu.
  const [kindResolved, setKindResolved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchServiceDetailsAction(params.id)
      .then((svc) => {
        if (cancelled) return;
        if (svc?.productKind === 'EMAIL') setProductKind('EMAIL');
        setKindResolved(true);
      })
      .catch(() => {
        if (!cancelled) setKindResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const EMAIL_TAB_IDS: TabId[] = ['overview', 'subscription', 'domains', 'mail', 'backups'];
  const isEmail = productKind === 'EMAIL';
  // Przed rozpoznaniem typu pokazujemy tylko bezpieczny podzbiór (pocztowy), który
  // jest zawarty w zestawie hostingu — hosting po prostu „dobierze" zakładki po
  // załadowaniu, a poczta nigdy nie pokaże narzędzi hostingu.
  const visibleTabs =
    isEmail || !kindResolved ? TABS.filter((t) => EMAIL_TAB_IDS.includes(t.id)) : TABS;
  // Elementy „hostingowe" (autoskalowanie, karta Panel hostingu) pokazujemy
  // dopiero, gdy wiemy, że to NIE poczta — w przeciwnym razie migają dla poczty.
  const showHostingChrome = kindResolved && !isEmail;

  // Gdy poczta, a aktywna zakładka jest hostingowa (np. deep-link ?tab=ssl) —
  // wróć na Przegląd, żeby nie pokazać narzędzi hostingu.
  useEffect(() => {
    if (isEmail && !EMAIL_TAB_IDS.includes(activeTab)) {
      setActiveTab('overview');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmail, activeTab]);

  return (
    <HostingLinksProvider serviceId={params.id}>
      <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4 animate-in fade-in duration-500 sm:space-y-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard/services"
            className="shrink-0 rounded-xl border border-white/5 bg-[#0a0a0a] p-2.5 text-neutral-400 transition-colors hover:bg-[#121212] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 min-w-0">
              <Server className="h-5 w-5 shrink-0" />
              <span className="truncate">Twoja usługa</span>
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 truncate">
              {isEmail
                ? 'Zarządzanie pocztą e-mail w Twojej domenie.'
                : 'Dashboard, statystyki i narzędzia hostingowe.'}
            </p>
          </div>
        </div>

        <MobileTabStrip
          tabs={visibleTabs}
          active={activeTab}
          onChange={setActiveTab}
          stickyBelowHeader
        />

        <div className="flex flex-wrap gap-2 lg:hidden">
          <Link
            href={`/dashboard/services/${params.id}/plan`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Zmiana planu
          </Link>
          {showHostingChrome ? (
            <Link
              href={`/dashboard/services/${params.id}/autoscaling`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white"
            >
              <Gauge className="h-3.5 w-3.5 shrink-0 opacity-70" />
              Autoskalowanie
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5">
          <aside className="hidden min-w-0 space-y-4 lg:sticky lg:top-6 lg:block lg:self-start">
            <nav className="space-y-0.5 rounded-2xl border border-white/10 bg-[#0a0a0a] p-2">
              {visibleTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <tab.icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'opacity-60'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}

              <div className="my-1 border-t border-white/5" />

              <Link
                href={`/dashboard/services/${params.id}/plan`}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <ArrowRightLeft className="h-4 w-4 shrink-0 opacity-60" />
                <span>Zmiana planu</span>
              </Link>
              {showHostingChrome ? (
                <Link
                  href={`/dashboard/services/${params.id}/autoscaling`}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Gauge className="h-4 w-4 shrink-0 opacity-60" />
                  <span>Autoskalowanie</span>
                </Link>
              ) : null}
            </nav>
            {showHostingChrome ? <HostingPanelCard /> : null}
            <ServiceConnectionCard serviceId={params.id} productKind={productKind} />
          </aside>

          <main className="min-w-0 max-w-full overflow-x-hidden">
            {activeTab === 'overview' && (
              <ServiceOverviewTab serviceId={params.id} onNavigate={(t) => setActiveTab(t as TabId)} />
            )}
            {activeTab === 'subscription' && <ServiceSubscriptionTab serviceId={params.id} />}
            {activeTab === 'domains' && <DomainsTab serviceId={params.id} />}
            {activeTab === 'databases' && <DatabasesTab serviceId={params.id} />}
            {activeTab === 'mail' && <MailTab serviceId={params.id} />}
            {activeTab === 'ssl' && <SSLTab serviceId={params.id} />}
            {activeTab === 'apps' && <AppsTab serviceId={params.id} />}
            {activeTab === 'php' && <PhpTab serviceId={params.id} />}
            {activeTab === 'ftp' && <FtpTab serviceId={params.id} />}
            {activeTab === 'cron' && <CronTab serviceId={params.id} />}
            {activeTab === 'backups' && <BackupsTab serviceId={params.id} />}
            {activeTab === 'waf' && <WafTab serviceId={params.id} />}
            {activeTab === 'monitoring' && <MonitoringTab serviceId={params.id} />}
            {activeTab === 'staging' && <StagingTab serviceId={params.id} />}
            {activeTab === 'deploy' && <DeployTab serviceId={params.id} />}
            {activeTab === 'files' && <FileManagerClient serviceId={params.id} />}
            {activeTab === 'usage' && <UsageTab serviceId={params.id} />}
          </main>

          <div className="min-w-0 space-y-4 lg:hidden">
            {showHostingChrome ? <HostingPanelCard /> : null}
            <ServiceConnectionCard serviceId={params.id} productKind={productKind} />
          </div>
        </div>
      </div>
    </HostingLinksProvider>
  );
}

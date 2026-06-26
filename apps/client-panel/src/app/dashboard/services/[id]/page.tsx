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
  Wand2,
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
import SiteBuilderTab from '@/components/hosting/SiteBuilderTab';
import UsageTab from '@/components/hosting/UsageTab';
import ServiceOverviewTab from '@/components/hosting/ServiceOverviewTab';
import ServiceSubscriptionTab from '@/components/hosting/ServiceSubscriptionTab';
import HostingPanelCard from '@/components/hosting/HostingPanelCard';
import ServiceConnectionCard from '@/components/hosting/ServiceConnectionCard';
import { HostingLinksProvider } from '@/components/hosting/hosting-links-context';
import { MobileTabStrip } from '@/components/panel';
import { fetchServiceKindAction } from '@/app/dashboard/services/[id]/hosting-service-actions';

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
  { id: 'builder', label: 'Kreator stron', icon: Wand2 },
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
  // dla poczty. PERF-1 — typ usługi bierzemy najpierw z parametru URL (?kind=…),
  // który lista usług dokleja do linku „Zarządzaj" — dzięki temu właściwy zestaw
  // zakładek jest gotowy NATYCHMIAST, bez ciężkiego /services/:id (live health).
  const kindHint = ((): 'HOSTING' | 'EMAIL' | null => {
    const k = searchParams.get('kind');
    return k === 'EMAIL' || k === 'HOSTING' ? k : null;
  })();
  const [productKind, setProductKind] = useState<'HOSTING' | 'EMAIL'>(kindHint ?? 'HOSTING');
  // Mając hint z URL traktujemy typ jako rozpoznany od razu (zero migania).
  // Bez hinta (deep-link) dobieramy typ lekkim endpointem :id/kind i do tego
  // czasu pokazujemy neutralny szkielet nawigacji zamiast błędnego zestawu.
  const [kindResolved, setKindResolved] = useState(kindHint != null);
  // SVC-TAG — handle usługi do nagłówka (zawsze dociągamy lekko w tle).
  const [serviceTag, setServiceTag] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Zawsze dociągamy lekki endpoint dla handle'a (i dla typu, gdy brak hinta);
    // przy obecnym hincie zakładki są już gotowe, więc to nie blokuje widoku.
    fetchServiceKindAction(params.id)
      .then((svc) => {
        if (cancelled) return;
        if (kindHint == null && svc?.productKind === 'EMAIL') setProductKind('EMAIL');
        if (svc?.serviceTag) setServiceTag(svc.serviceTag);
        setKindResolved(true);
      })
      .catch(() => {
        if (!cancelled) setKindResolved(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const EMAIL_TAB_IDS: TabId[] = ['overview', 'subscription', 'domains', 'mail', 'backups'];
  // GUIDE-4 — zakładki „zaawansowane" ukrywane w trybie prostym (dla osób, które
  // chcą tylko podstaw). Nie dotyczy poczty (ma własny, krótki zestaw).
  const ADVANCED_TAB_IDS: TabId[] = ['php', 'ftp', 'cron', 'waf', 'staging', 'deploy', 'usage'];
  const isEmail = productKind === 'EMAIL';

  // GUIDE-4 — tryb prosty/zaawansowany, zapamiętany lokalnie per przeglądarka.
  const [simpleMode, setSimpleMode] = useState(false);
  useEffect(() => {
    try {
      setSimpleMode(localStorage.getItem('verris-simple-mode') === '1');
    } catch {
      /* brak localStorage — pełny tryb */
    }
  }, []);
  const toggleSimpleMode = () => {
    setSimpleMode((v) => {
      const next = !v;
      try {
        localStorage.setItem('verris-simple-mode', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Przed rozpoznaniem typu pokazujemy tylko bezpieczny podzbiór (pocztowy), który
  // jest zawarty w zestawie hostingu — hosting po prostu „dobierze" zakładki po
  // załadowaniu, a poczta nigdy nie pokaże narzędzi hostingu.
  const visibleTabs = (
    isEmail || !kindResolved ? TABS.filter((t) => EMAIL_TAB_IDS.includes(t.id)) : TABS
  ).filter((t) => !(simpleMode && !isEmail && ADVANCED_TAB_IDS.includes(t.id)));
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

  // GUIDE-4 — gdy tryb prosty ukryje aktywną zakładkę, wróć na Przegląd.
  useEffect(() => {
    if (simpleMode && !isEmail && ADVANCED_TAB_IDS.includes(activeTab)) {
      setActiveTab('overview');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simpleMode, isEmail, activeTab]);

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
              {serviceTag ? (
                <span
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] font-normal text-neutral-300"
                  title="Identyfikator usługi"
                >
                  {serviceTag}
                </span>
              ) : null}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 truncate">
              {!kindResolved
                ? 'Wczytywanie usługi…'
                : isEmail
                  ? 'Zarządzanie pocztą e-mail w Twojej domenie.'
                  : 'Dashboard, statystyki i narzędzia hostingowe.'}
            </p>
          </div>
          {showHostingChrome ? (
            <button
              type="button"
              onClick={toggleSimpleMode}
              title={
                simpleMode
                  ? 'Pokaż wszystkie narzędzia (tryb zaawansowany)'
                  : 'Ukryj zaawansowane narzędzia (tryb prosty)'
              }
              className="ml-auto shrink-0 rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {simpleMode ? 'Tryb: prosty' : 'Tryb: zaawansowany'}
            </button>
          ) : null}
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
            <ServiceConnectionCard serviceId={params.id} productKind={showHostingChrome ? 'HOSTING' : 'EMAIL'} />
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
            {activeTab === 'builder' && <SiteBuilderTab serviceId={params.id} />}
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
            <ServiceConnectionCard serviceId={params.id} productKind={showHostingChrome ? 'HOSTING' : 'EMAIL'} />
          </div>
        </div>
      </div>
    </HostingLinksProvider>
  );
}

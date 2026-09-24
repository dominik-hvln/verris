'use client';

/**
 * Strona usługi. PB-15: sekcje usługi są w menu bocznym (components/panel/service-nav.tsx),
 * zakładka siedzi w adresie (?tab=), więc tu zostaje ścieżka + treść zakładki.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';

import DomainsTab from '@/components/hosting/DomainsTab';
import DatabasesTab from '@/components/hosting/DatabasesTab';
import MailTab from '@/components/hosting/MailTab';
import LogsTab from '@/components/hosting/LogsTab';
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
import WebToolsTab from '@/components/hosting/WebToolsTab';
import UsageTab from '@/components/hosting/UsageTab';
import BadgesTab from '@/components/hosting/BadgesTab';
import ServiceOverviewTab from '@/components/hosting/ServiceOverviewTab';
import ServiceOverviewV2 from '@/components/hosting/ServiceOverviewV2';
import { AssistantHint } from '@/components/assistant/AssistantHint';
import ServiceSubscriptionTab from '@/components/hosting/ServiceSubscriptionTab';
import ServiceConnectionCard from '@/components/hosting/ServiceConnectionCard';
import { HostingLinksProvider } from '@/components/hosting/hosting-links-context';
import { MobileTabStrip } from '@/components/panel';
import { SectionHead } from '@/components/panel/v2';
import { fetchServiceKindAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import { SIMPLE_MODE_KEY, TABS, isTabId, visibleTabIds, type TabId } from './tabs';

export default function HostingManagerPage() {
  const params = useParams() as { id: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // PERF-1 — typ z ?kind= (lista usług dokleja go do linku) = właściwy zestaw zakładek od razu.
  const kindHint = ((): 'HOSTING' | 'EMAIL' | null => {
    const k = searchParams.get('kind');
    return k === 'EMAIL' || k === 'HOSTING' ? k : null;
  })();
  const [productKind, setProductKind] = useState<'HOSTING' | 'EMAIL'>(kindHint ?? 'HOSTING');
  const [kindResolved, setKindResolved] = useState(kindHint != null);
  const [serviceTag, setServiceTag] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
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

  // GUIDE-4 — tryb prosty chowa narzędzia dla zaawansowanych. Przełącznik: menu użytkownika.
  const [simpleMode, setSimpleMode] = useState(false);
  useEffect(() => {
    const sync = () => {
      try {
        setSimpleMode(localStorage.getItem(SIMPLE_MODE_KEY) === '1');
      } catch {
        /* pełny */
      }
    };
    sync();
    window.addEventListener('verris-mode', sync);
    return () => window.removeEventListener('verris-mode', sync);
  }, []);

  const isEmail = productKind === 'EMAIL';
  const showHostingChrome = kindResolved && !isEmail;
  const visibleIds = visibleTabIds({ email: isEmail, kindResolved, simple: simpleMode });
  const visibleTabs = TABS.filter((t) => visibleIds.includes(t.id));

  // Zakładka z adresu; niedostępna w tym typie/trybie → Przegląd.
  const requested = searchParams.get('tab');
  const activeTab: TabId = isTabId(requested) && visibleIds.includes(requested) ? requested : 'overview';
  const setActiveTab = (t: TabId) => {
    const q = new URLSearchParams(searchParams.toString());
    q.set('tab', t);
    if (kindResolved) q.set('kind', productKind);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <HostingLinksProvider serviceId={params.id}>
      <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-5">
        <div className="flex min-w-0 items-center gap-2 text-[13.5px] text-muted-foreground">
          <Link href="/dashboard/services" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Usługi
          </Link>
          <span aria-hidden>/</span>
          <span className="break-words font-semibold text-foreground">
            {!kindResolved ? 'Wczytywanie…' : isEmail ? 'Poczta' : 'Hosting'}
            {activeTab !== 'overview' ? <span className="font-normal text-muted-foreground"> / {TABS.find((t) => t.id === activeTab)?.label}</span> : null}
          </span>
          {serviceTag ? (
            <span className="shrink-0 rounded border border-line bg-card px-1.5 py-px font-mono text-[11px] text-muted-foreground" data-tip="Identyfikator usługi">
              {serviceTag}
            </span>
          ) : null}
        </div>

        {/* Na telefonie menu boczne jest szufladą — sekcje usługi także jako pasek zakładek. */}
        <div className="lg:hidden">
          <MobileTabStrip tabs={visibleTabs} active={activeTab} onChange={setActiveTab} stickyBelowHeader />
        </div>

        {showHostingChrome ? <AssistantHint serviceId={params.id} onNavigate={(t) => isTabId(t) && setActiveTab(t)} /> : null}

        <main className="min-w-0 max-w-full">
          {activeTab === 'overview' &&
            (showHostingChrome ? (
              <ServiceOverviewV2 serviceId={params.id} onNavigate={(t) => setActiveTab(t as TabId)} />
            ) : (
              <ServiceOverviewTab serviceId={params.id} onNavigate={(t) => setActiveTab(t as TabId)} />
            ))}
          {activeTab === 'subscription' && <ServiceSubscriptionTab serviceId={params.id} />}
          {activeTab === 'domains' && <DomainsTab serviceId={params.id} />}
          {activeTab === 'databases' && <DatabasesTab serviceId={params.id} />}
          {activeTab === 'mail' && <MailTab serviceId={params.id} />}
          {activeTab === 'ssl' && <SSLTab serviceId={params.id} />}
          {activeTab === 'apps' && <AppsTab serviceId={params.id} />}
          {activeTab === 'webtools' && <WebToolsTab serviceId={params.id} />}
          {activeTab === 'php' && <PhpTab serviceId={params.id} />}
          {activeTab === 'ftp' && <FtpTab serviceId={params.id} />}
          {activeTab === 'cron' && <CronTab serviceId={params.id} />}
          {activeTab === 'backups' && <BackupsTab serviceId={params.id} />}
          {activeTab === 'waf' && <WafTab serviceId={params.id} />}
          {activeTab === 'monitoring' && <MonitoringTab serviceId={params.id} />}
          {activeTab === 'logs' && <LogsTab serviceId={params.id} />}
          {activeTab === 'badges' && <BadgesTab serviceId={params.id} />}
          {activeTab === 'staging' && <StagingTab serviceId={params.id} />}
          {activeTab === 'deploy' && <DeployTab serviceId={params.id} />}
          {activeTab === 'files' && (
            <section className="space-y-3">
              <SectionHead title="Menedżer plików" desc="Pliki wszystkich stron na koncie. Plik jednej domeny otworzysz też z widoku strony." />
              <FileManagerClient serviceId={params.id} />
            </section>
          )}
          {activeTab === 'usage' && <UsageTab serviceId={params.id} />}
        </main>

        {/* Dane dostępowe: przegląd hostingu ma je w prawej kolumnie (jak we wzorcu),
            przegląd poczty — pod treścią. Pozostałe zakładki ich nie powtarzają. */}
        {kindResolved && !showHostingChrome && activeTab === 'overview' ? (
          <ServiceConnectionCard serviceId={params.id} productKind="EMAIL" />
        ) : null}
      </div>
    </HostingLinksProvider>
  );
}

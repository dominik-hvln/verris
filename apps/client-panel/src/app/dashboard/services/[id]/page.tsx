'use client';

import React, { useState } from 'react';
import {
  Server,
  Globe,
  Database,
  Shield,
  Box,
  ArrowLeft,
  Rocket,
  FolderOpen,
  Activity,
  LayoutDashboard,
  Gauge,
  ArrowRightLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import DomainsTab from '@/components/hosting/DomainsTab';
import DatabasesTab from '@/components/hosting/DatabasesTab';
import SSLTab from '@/components/hosting/SSLTab';
import StagingTab from '@/components/hosting/StagingTab';
import DeployTab from '@/components/hosting/DeployTab';
import HostingFileManagerTab from '@/components/hosting/HostingFileManagerTab';
import UsageTab from '@/components/hosting/UsageTab';
import ServiceOverviewTab from '@/components/hosting/ServiceOverviewTab';
import HostingPanelCard from '@/components/hosting/HostingPanelCard';
import ServiceConnectionCard from '@/components/hosting/ServiceConnectionCard';
import { HostingLinksProvider } from '@/components/hosting/hosting-links-context';

const TABS = [
  { id: 'overview', label: 'Przegląd', icon: LayoutDashboard },
  { id: 'domains', label: 'Domeny & DNS', icon: Globe },
  { id: 'databases', label: 'Bazy MySQL', icon: Database },
  { id: 'files', label: 'Pliki', icon: FolderOpen },
  { id: 'ssl', label: 'SSL', icon: Shield },
  { id: 'staging', label: 'Staging', icon: Box },
  { id: 'deploy', label: 'Deploy', icon: Rocket },
  { id: 'usage', label: 'Usage', icon: Activity },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function HostingManagerPage() {
  const params = useParams() as { id: string };
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <HostingLinksProvider serviceId={params.id}>
      <div className="mx-auto max-w-6xl space-y-5 animate-in fade-in duration-500 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
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
              Dashboard, statystyki i narzędzia hostingowe.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-4 min-w-0 lg:sticky lg:top-6 lg:self-start">
            <nav className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-2 space-y-0.5">
              {TABS.map((tab) => {
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
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}

              <div className="my-1 border-t border-white/5" />

              <Link
                href={`/dashboard/services/${params.id}/plan`}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <ArrowRightLeft className="h-4 w-4 shrink-0 opacity-60" />
                <span className="truncate">Zmiana planu</span>
              </Link>
              <Link
                href={`/dashboard/services/${params.id}/autoscaling`}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Gauge className="h-4 w-4 shrink-0 opacity-60" />
                <span className="truncate">Autoskalowanie</span>
              </Link>
            </nav>
            <HostingPanelCard />
            <ServiceConnectionCard serviceId={params.id} />
          </aside>

          <main className="min-w-0 overflow-hidden">
            {activeTab === 'overview' && (
              <ServiceOverviewTab serviceId={params.id} onNavigate={(t) => setActiveTab(t as TabId)} />
            )}
            {activeTab === 'domains' && <DomainsTab serviceId={params.id} />}
            {activeTab === 'databases' && <DatabasesTab serviceId={params.id} />}
            {activeTab === 'ssl' && <SSLTab serviceId={params.id} />}
            {activeTab === 'staging' && <StagingTab serviceId={params.id} />}
            {activeTab === 'deploy' && <DeployTab serviceId={params.id} />}
            {activeTab === 'files' && <HostingFileManagerTab serviceId={params.id} />}
            {activeTab === 'usage' && <UsageTab serviceId={params.id} />}
          </main>
        </div>
      </div>
    </HostingLinksProvider>
  );
}

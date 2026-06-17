'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { PageHeaderRow } from '@/components/panel';
import {
  Globe,
  Database,
  ShieldCheck,
  Network,
  FolderKanban,
  Terminal,
  Mail,
  HardDriveDownload,
  FolderOpen,
  Repeat,
} from 'lucide-react';

function hostingHref(
  path: string,
  serviceId?: string | null,
  extra?: Record<string, string>,
): string {
  const p = new URLSearchParams();
  if (serviceId && serviceId.length > 0) p.set('serviceId', serviceId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
    }
  }
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

export interface HostingTabsProps {
  currentTab:
    | 'dns'
    | 'domains'
    | 'databases'
    | 'ssl'
    | 'ftp'
    | 'cron'
    | 'email'
    | 'php'
    | 'apps'
    | 'backups'
    | 'filemanager'
    | 'migrations';
  /** Wspólny kontekst usługi — `?serviceId=` na linkach (oprócz „Domeny”). */
  serviceId?: string | null;
  /** Opcjonalna strefa DNS — tylko dla linku „DNS” (`?zone=`). */
  dnsZone?: string | null;
}

export function HostingTabs({ currentTab, serviceId, dnsZone }: HostingTabsProps) {
  const zoneParam = dnsZone && dnsZone.length > 0 ? { zone: dnsZone } : undefined;

  const tabs = [
    { id: 'domains', label: 'Domeny', icon: Globe, href: '/dashboard/domains' },
    { id: 'dns', label: 'DNS', icon: Network, href: hostingHref('/dashboard/dns', serviceId, zoneParam) },
    { id: 'databases', label: 'Bazy Danych', icon: Database, href: hostingHref('/dashboard/databases', serviceId) },
    {
      id: 'filemanager',
      label: 'Pliki',
      icon: FolderOpen,
      href: hostingHref('/dashboard/file-manager', serviceId),
    },
    { id: 'ssl', label: 'Certyfikaty SSL', icon: ShieldCheck, href: hostingHref('/dashboard/ssl', serviceId) },
    { id: 'ftp', label: 'Konta FTP', icon: FolderKanban, href: hostingHref('/dashboard/ftp', serviceId) },
    { id: 'cron', label: 'Zadania Cron', icon: Terminal, href: hostingHref('/dashboard/cron', serviceId) },
    { id: 'php', label: 'Wersja PHP', icon: Terminal, href: hostingHref('/dashboard/php', serviceId) },
    { id: 'apps', label: 'Aplikacje 1-click', icon: FolderOpen, href: hostingHref('/dashboard/apps', serviceId) },
    { id: 'email', label: 'Poczta E-mail', icon: Mail, href: hostingHref('/dashboard/email', serviceId) },
    {
      id: 'backups',
      label: 'Kopie Zapasowe',
      icon: HardDriveDownload,
      href: hostingHref('/dashboard/backups', serviceId),
    },
    {
      id: 'migrations',
      label: 'Migracje',
      icon: Repeat,
      href: hostingHref('/dashboard/migrations', serviceId),
    },
  ] as const;

  return (
    <div className="border-b border-white/5 mb-6 pb-px overflow-x-auto overflow-y-hidden no-scrollbar">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`
                            flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all relative whitespace-nowrap
                            ${
                              isActive
                                ? 'text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-white/5'
                            }
                        `}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'opacity-60'}`} />
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-white shadow-[0_0_15px_rgba(255,255,255,1)]" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function HostingPageWrapper({
  title,
  description,
  children,
  currentTab,
  serviceId,
  dnsZone,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  currentTab?: HostingTabsProps['currentTab'];
  serviceId?: string | null;
  dnsZone?: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeaderRow title={title} description={description} actions={actions} />
      {currentTab ? (
        <HostingTabs currentTab={currentTab} serviceId={serviceId} dnsZone={dnsZone} />
      ) : null}
      {children}
    </div>
  );
}

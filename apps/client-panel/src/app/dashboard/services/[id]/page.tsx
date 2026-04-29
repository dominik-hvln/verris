'use client';

import React, { useState } from 'react';
import { 
  Server, Globe, Database, Shield, FolderGit2,
  Box, Settings, ArrowLeft, TerminalSquare, Rocket, PlayCircle, FolderOpen, Key
} from 'lucide-react';
import Link from 'next/link';

// Import tab components
import DomainsTab from '@/components/hosting/DomainsTab';
import DatabasesTab from '@/components/hosting/DatabasesTab';
import SSLTab from '@/components/hosting/SSLTab';
import StagingTab from '@/components/hosting/StagingTab';
import DeployTab from '@/components/hosting/DeployTab';
import MagicLoginTab from '@/components/hosting/MagicLoginTab';
import HostingFileManagerTab from '@/components/hosting/HostingFileManagerTab';

import { useParams } from 'next/navigation';

export default function HostingManagerPage() {
  const params = useParams() as { id: string };
  const [activeTab, setActiveTab] = useState('domains');

  const TABS = [
    { id: 'domains', label: 'Domeny & DNS', icon: Globe },
    { id: 'databases', label: 'Bazy MySQL', icon: Database },
    { id: 'files', label: 'File Manager', icon: FolderOpen },
    { id: 'ssl', label: 'Certyfikaty SSL', icon: Shield },
    { id: 'staging', label: 'Staging (Klony)', icon: Box },
    { id: 'deploy', label: 'Push-To-Deploy', icon: Rocket },
    { id: 'magic', label: 'Magic Login', icon: Key },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Info */}
      <div className="flex items-center gap-4 mb-4">
        <Link href="/dashboard/services" className="p-3 border border-white/5 rounded-2xl bg-[#0a0a0a] hover:bg-[#121212] transition-colors text-neutral-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white flex flex-wrap items-center gap-3 break-all sm:break-normal">
            <Server className="w-8 h-8 md:w-10 md:h-10 text-white shrink-0" />
            Hosting Manager{' '}
            <span className="text-neutral-500 text-lg md:text-xl font-mono font-medium pl-2 break-all">{params.id}</span>
          </h1>
          <p className="text-neutral-400 mt-2 text-md md:text-lg">Zarządzaj swoją przestrzenią, bazami danych i uprawnieniami serwera.</p>
        </div>
      </div>

      {/* Tabs Desktop & Mobile Scroller */}
      <div className="border-b border-white/5 mb-6 pb-px overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all relative whitespace-nowrap
                ${activeTab === tab.id 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'}
              `}
            >
              <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-white' : 'opacity-60'}`} />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-white shadow-[0_0_15px_rgba(255,255,255,1)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="w-full min-w-0">
        {activeTab === 'domains' && <DomainsTab serviceId={params.id} />}
        {activeTab === 'databases' && <DatabasesTab serviceId={params.id} />}
        {activeTab === 'ssl' && <SSLTab serviceId={params.id} />}
        {activeTab === 'staging' && <StagingTab serviceId={params.id} />}
        {activeTab === 'deploy' && <DeployTab serviceId={params.id} />}
        {activeTab === 'magic' && <MagicLoginTab serviceId={params.id} />}
        {activeTab === 'files' && <HostingFileManagerTab serviceId={params.id} />}
      </div>
    </div>
  );
}

'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { HostingDaLinksResponseDto } from '@verris/contracts';
import { Loader2 } from 'lucide-react';
import { fetchHostingDaLinksAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';

const emptyLinks: HostingDaLinksResponseDto = {
  panelBaseUrl: '',
  panelDisplayHost: '',
  databasesUrl: '',
  sslUrl: '',
  fileManagerUrl: '',
  domainsUrl: '',
  dnsUrl: '',
  domainManageUrl: '',
  stagingHint: '',
  daUsername: null,
  daPassword: null,
  fetchError: null,
};

const HostingLinksContext = createContext<{
  links: HostingDaLinksResponseDto;
  loading: boolean;
}>({ links: emptyLinks, loading: true });

export function useHostingLinks() {
  return useContext(HostingLinksContext);
}

export function HostingLinksProvider({
  serviceId,
  children,
}: {
  serviceId: string;
  children: ReactNode;
}) {
  const [links, setLinks] = useState<HostingDaLinksResponseDto>(emptyLinks);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchHostingDaLinksAction(serviceId)
      .then((l) => {
        if (!cancel) setLinks(l);
      })
      .catch(() => {
        if (!cancel) setLinks(emptyLinks);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [serviceId]);

  return (
    <HostingLinksContext.Provider value={{ links, loading }}>
      {children}
    </HostingLinksContext.Provider>
  );
}

export function HostingLinksLoading({ label = 'Wczytywanie…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  ShieldCheck,
  Lock,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { Button } from '@verris/ui';
import type { HostingSslRowDto, HostingSslStatus } from '@verris/contracts';
import { HostingSslForms } from '@/components/hosting/HostingSslForms';
import { HostingHelpHint } from '@/components/hosting/HostingTabShell';
import { fetchHostingDaLinksAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { fetchHostingSslAction } from '@/app/dashboard/services/[id]/hosting-ssl-actions';

interface Props {
  serviceId: string;
}

const SSL_BADGE: Record<HostingSslStatus, { label: string; className: string }> = {
  VALID: { label: 'Aktywny', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' },
  EXPIRING: { label: 'Wygasa wkrótce', className: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
  EXPIRED: { label: 'Wygasły', className: 'border-rose-400/30 bg-rose-400/10 text-rose-200' },
  NONE: { label: 'Brak certyfikatu', className: 'border-white/15 bg-white/5 text-neutral-300' },
};

function SslBadge({ row }: { row: HostingSslRowDto | undefined }) {
  const status = row?.status ?? 'NONE';
  const meta = SSL_BADGE[status];
  const daysLeft = row?.daysLeft ?? null;
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.className}`}>
          {meta.label}
        </span>
        {row?.isWildcard ? (
          <span className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
            wildcard
          </span>
        ) : null}
      </div>
      {row && row.status !== 'NONE' ? (
        <span className="text-[11px] text-neutral-500">
          {row.issuer}
          {row.expiresAt
            ? ` · do ${new Date(row.expiresAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : ''}
          {daysLeft !== null
            ? daysLeft >= 0
              ? ` (${daysLeft} dni)`
              : ' (wygasł)'
            : ''}
        </span>
      ) : null}
      {row && row.coveredNames && row.coveredNames.length > 1 ? (
        <span className="text-[10px] text-neutral-600 md:text-right">
          Pokrywa: {row.coveredNames.slice(0, 4).join(', ')}
          {row.coveredNames.length > 4 ? ` +${row.coveredNames.length - 4}` : ''}
        </span>
      ) : null}
    </div>
  );
}

export default function SSLTab({ serviceId }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<{ name: string }[]>([]);
  const [domainFetchError, setDomainFetchError] = useState<string | null>(null);
  const [sslRows, setSslRows] = useState<Record<string, HostingSslRowDto>>({});
  const [sslUrl, setSslUrl] = useState<string | null>(null);
  const [panelBase, setPanelBase] = useState<string>('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [domRes, links, sslRes] = await Promise.all([
        fetchHostingDomainsAction(serviceId),
        fetchHostingDaLinksAction(serviceId),
        fetchHostingSslAction(serviceId),
      ]);
      setDomains(domRes.domains);
      setDomainFetchError(domRes.fetchError);
      setSslUrl(links.sslUrl || null);
      setPanelBase(links.panelBaseUrl || '');
      const map: Record<string, HostingSslRowDto> = {};
      for (const r of sslRes?.rows ?? []) map[r.domain] = r;
      setSslRows(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wczytać danych SSL.');
      setDomains([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-neutral-400">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        Wczytywanie certyfikatów…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <HostingHelpHint
        help={{
          blurb:
            'Certyfikat SSL (kłódka, HTTPS) wystawiamy za darmo (Let’s Encrypt). Warunek: domena musi już wskazywać na nasz serwer. Jeśli status to „brak", najpierw skieruj domenę i ponów.',
          kbQuery: 'certyfikat SSL',
        }}
      />
      <div className="flex flex-wrap justify-end gap-3 mb-2">
        {sslUrl ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10 gap-2"
          >
            <a href={sslUrl} target="_blank" rel="noopener noreferrer">
              <Lock className="h-4 w-4" />
              Panel SSL (zaawansowany)
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void load();
          }}
          className="gap-2 border-white/15"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Odśwież
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 flex gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" /> {error}
        </div>
      ) : null}

      <div className="relative rounded-[32px] p-px overflow-hidden">
        <div className="rounded-[calc(32px-1px)] bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/5 p-8">
          <div className="flex items-start gap-3 border-b border-white/5 pb-6 mb-6">
            <div className="p-3 rounded-2xl bg-white/10 text-white border border-white/20 shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">Certyfikaty SSL</h2>
              <p className="text-sm text-neutral-400 mt-1">
                Wystaw Let&apos;s Encrypt lub wklej własny certyfikat bez wychodzenia z panelu Verris.
                Poniżej lista domen na koncie hostingowym.
              </p>
            </div>
          </div>

          <div className="mb-8">
            <HostingSslForms serviceId={serviceId} />
          </div>

          {domainFetchError ? (
            <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" /> {domainFetchError}
            </div>
          ) : null}

          <div className="space-y-4">
            {domains.length === 0 && !domainFetchError ? (
              <p className="text-neutral-500 text-sm">Brak dodatkowych domen na koncie lub konto w trakcie zakładania.</p>
            ) : null}
            {domains.map((d) => (
              <div
                key={d.name}
                className="group/row relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-white/5 bg-[#050505]/40 hover:bg-[#121212]/60 transition-all"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/20">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="break-all text-base font-bold tracking-wide text-white font-mono sm:text-lg">{d.name}</div>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
                  <SslBadge row={sslRows[d.name]} />
                  {sslUrl ? (
                    <a
                      href={sslUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-white"
                    >
                      Zarządzaj w panelu SSL
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {panelBase ? (
            <p className="text-xs text-neutral-500 mt-8">
              Podstawowy URL panelu: <span className="font-mono text-neutral-300">{panelBase}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

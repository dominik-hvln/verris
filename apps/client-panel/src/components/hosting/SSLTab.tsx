'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, ExternalLink, RefreshCw } from 'lucide-react';
import { Kpi, KpiStrip, SectionHead, StatusPill, type Tone } from '@/components/panel/v2';
import { days as daysLabel } from '@/lib/pl';
import type { HostingSslRowDto, HostingSslStatus } from '@verris/contracts';
import { HostingSslForms } from '@/components/hosting/HostingSslForms';
import { HostingHelpHint } from '@/components/hosting/HostingTabShell';
import { fetchHostingDaLinksAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { fetchHostingSslAction } from '@/app/dashboard/services/[id]/hosting-ssl-actions';

interface Props {
  serviceId: string;
}

const SSL_LABEL: Record<HostingSslStatus, { label: string; tone: Tone }> = {
  VALID: { label: 'ważny', tone: 'data' },
  EXPIRING: { label: 'wygasa wkrótce', tone: 'warn' },
  EXPIRED: { label: 'wygasł', tone: 'warn' },
  NONE: { label: 'brak certyfikatu', tone: 'muted' },
};

const TH = 'whitespace-nowrap px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground';
const TD = 'border-t border-line px-3 py-[11px] align-middle';
const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:border-primary disabled:opacity-50';

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

  const rows = domains.map((d) => sslRows[d.name]);
  const count = (st: HostingSslStatus) => rows.filter((r) => (r?.status ?? 'NONE') === st).length;

  return (
    <div className="space-y-6">
      <SectionHead
        title="Certyfikaty SSL"
        desc="Kłódka i HTTPS dla każdej domeny. Let’s Encrypt wystawiamy za darmo i odnawiamy sami — warunek: domena wskazuje na nasz serwer."
        action={
          <div className="flex flex-wrap gap-2">
            {sslUrl ? (
              <a href={sslUrl} target="_blank" rel="noopener noreferrer" className={BTN}>
                <Lock className="h-[15px] w-[15px]" /> Panel SSL (zaawansowany)
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            ) : null}
            <button
              type="button"
              className={BTN}
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                void load();
              }}
            >
              {refreshing ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <RefreshCw className="h-[15px] w-[15px]" />}
              Odśwież
            </button>
          </div>
        }
      />

      {error ? <p className="m-0 rounded-[10px] bg-[color-mix(in_srgb,var(--crit)_12%,transparent)] px-4 py-3 text-sm text-crit">{error}</p> : null}
      {domainFetchError ? <p className="m-0 rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">{domainFetchError}</p> : null}

      <KpiStrip>
        <Kpi label="Domeny" value={domains.length} foot={<span>na koncie hostingowym</span>} />
        <Kpi label="Z ważnym certyfikatem" value={count('VALID')} foot={<span>kłódka działa</span>} />
        <Kpi label="Wygasają wkrótce" value={count('EXPIRING') + count('EXPIRED')} foot={<span>odnowimy przed końcem</span>} />
        <Kpi label="Bez certyfikatu" value={count('NONE')} foot={<span>strona bez kłódki</span>} />
      </KpiStrip>

      <section>
        <SectionHead title="Domeny i certyfikaty" />
        {domains.length === 0 ? (
          <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">
            Brak domen na koncie albo konto jest jeszcze zakładane.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
            <table className="v2-stack w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>Domena</th>
                  <th className={TH}>Stan</th>
                  <th className={TH}>Wystawca</th>
                  <th className={TH}>Ważny do</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => {
                  const r = sslRows[d.name];
                  const st = SSL_LABEL[r?.status ?? 'NONE'];
                  return (
                    <tr key={d.name}>
                      <td className={TD} data-label="Domena">
                        <b className="block break-all font-semibold text-foreground">{d.name}</b>
                        {r && r.coveredNames.length > 0 ? (
                          <span className="block text-[12.5px] text-muted-foreground">obejmuje: {r.coveredNames.join(', ')}</span>
                        ) : null}
                      </td>
                      <td className={TD} data-label="Stan">
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        {r?.isWildcard ? <span className="ml-2 font-mono text-[11px] text-muted-foreground">wildcard</span> : null}
                      </td>
                      <td className={`${TD} text-verris-body`} data-label="Wystawca">
                        {r && r.status !== 'NONE' ? (r.isLetsEncrypt ? 'Let’s Encrypt' : r.issuer) : '—'}
                      </td>
                      <td className={`${TD} whitespace-nowrap`} data-label="Ważny do">
                        {r?.expiresAt ? (
                          <>
                            <span className="tabular-nums text-foreground">
                              {new Date(r.expiresAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {r.daysLeft !== null ? (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{r.daysLeft >= 0 ? daysLabel(r.daysLeft) : 'po terminie'}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Wystaw lub wgraj certyfikat" desc="Let’s Encrypt jednym kliknięciem albo własny certyfikat (np. z zakupu) — bez wychodzenia z panelu." />
        <div className="rounded-[10px] border border-line bg-card p-4">
          <HostingSslForms serviceId={serviceId} />
        </div>
      </section>

      <HostingHelpHint
        help={{
          blurb: 'Jeśli domena ma stan „brak certyfikatu”, najpierw skieruj ją na nasz serwer, a potem wystaw certyfikat ponownie.',
          kbQuery: 'certyfikat SSL',
        }}
      />
      {panelBase ? <p className="m-0 font-mono text-[11.5px] text-muted-foreground">Adres panelu hostingu: {panelBase}</p> : null}
    </div>
  );
}

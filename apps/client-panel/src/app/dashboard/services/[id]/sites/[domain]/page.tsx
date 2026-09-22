'use client';

/**
 * PB-16 — widok strony (domeny) na usłudze hostingowej, wg wzorca
 * (docs/design/wzorzec-panelu.html → viewSite). Tylko realne dane z API.
 * Czego API jeszcze nie daje (ruch, TTFB, błędy 5xx per domena, technologia,
 * data wygaśnięcia domeny, logi) — tego tu nie ma; lista w docs/VERRIS.md.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  HostingDnsRecordDto,
  HostingDomainsResponseDto,
  HostingEmailAccountsResponseDto,
  HostingSslResponseDto,
} from '@verris/contracts';

import { Box, Kpi, KpiStrip, Meter, SectionHead, StatusPill } from '@/components/panel/v2';
import { DnsManager } from '@/app/dashboard/dns/dns-manager';
import { FileManagerClient } from '@/app/dashboard/file-manager/file-manager-client';
import DatabasesTab from '@/components/hosting/DatabasesTab';
import WebToolsTab from '@/components/hosting/WebToolsTab';
import { HostingLinksProvider } from '@/components/hosting/hosting-links-context';
import { fetchHostingDnsAction, fetchHostingDomainsAction } from '../../hosting-domains-action';
import { fetchHostingSslAction, requestLetsEncryptSslAction } from '../../hosting-ssl-actions';
import { fetchHostingEmailAction } from '../../hosting-email-actions';
import { fetchServiceDetailsAction } from '../../hosting-service-actions';
import { getMonitoringStatus, type MonitoringStatus } from '../../monitoring-actions';
import { fetchDomainPhp, setDomainPhp, type DomainPhpStatus } from '@/app/dashboard/php/php-actions';
import { SIMPLE_MODE_KEY } from '../../tabs';

const SITE_TABS = [
  ['overview', 'Przegląd'],
  ['dns', 'Domena i DNS'],
  ['ssl', 'SSL'],
  ['files', 'Pliki'],
  ['db', 'Baza'],
  ['mail', 'Poczta'],
  ['php', 'PHP i serwer'],
  ['redirects', 'Przekierowania'],
] as const;
type SiteTab = (typeof SITE_TABS)[number][0];
const isSiteTab = (t: string | null): t is SiteTab => SITE_TABS.some(([id]) => id === t);

const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground no-underline hover:border-primary disabled:opacity-50';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-primary bg-primary px-[13px] py-2 text-sm font-semibold text-primary-foreground no-underline hover:bg-data-hi disabled:opacity-50';
const BTN_SM = 'px-2.5 py-[5px] text-[13px]';
const TH = 'px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground whitespace-nowrap';
const TD = 'border-t border-line px-3 py-[11px] align-middle text-verris-body';

/** undefined = wczytywanie; 'error' = wyjątek. Akcje zwracające null przy błędzie dają null = brak danych. */
type Loaded<T> = T | undefined | 'error';

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [Loaded<T>, () => void] {
  const [v, setV] = useState<Loaded<T>>(undefined);
  const [n, setN] = useState(0);
  useEffect(() => {
    let off = false;
    fn()
      .then((r) => !off && setV(r))
      .catch(() => !off && setV('error'));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return [v, () => setN((x) => x + 1)];
}
const ok = <T,>(v: Loaded<T>): T | null => (v === 'error' || v === undefined ? null : v);

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SitePage() {
  const params = useParams() as { id: string; domain: string };
  const serviceId = params.id;
  const domain = decodeURIComponent(params.domain);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: SiteTab = isSiteTab(sp.get('tab')) ? (sp.get('tab') as SiteTab) : 'overview';
  const setTab = (t: SiteTab) => router.replace(t === 'overview' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const [simple, setSimple] = useState(false);
  useEffect(() => {
    const sync = () => {
      try {
        setSimple(localStorage.getItem(SIMPLE_MODE_KEY) === '1');
      } catch {
        /* pełny */
      }
    };
    sync();
    window.addEventListener('verris-mode', sync);
    return () => window.removeEventListener('verris-mode', sync);
  }, []);

  const [domains] = useLoad<HostingDomainsResponseDto>(() => fetchHostingDomainsAction(serviceId), [serviceId]);
  const [planName, setPlanName] = useState<string | null>(null);
  useEffect(() => {
    fetchServiceDetailsAction(serviceId)
      .then((s) => setPlanName(s.plan.name))
      .catch(() => undefined);
  }, [serviceId]);
  const [dns, reloadDns] = useLoad(() => fetchHostingDnsAction(serviceId, domain), [serviceId, domain]);
  const [ssl, reloadSsl] = useLoad<HostingSslResponseDto | null>(() => fetchHostingSslAction(serviceId), [serviceId]);
  const [mail] = useLoad<HostingEmailAccountsResponseDto>(() => fetchHostingEmailAction(serviceId), [serviceId]);
  const [php, reloadPhp] = useLoad<DomainPhpStatus | null>(() => fetchDomainPhp(serviceId, domain), [serviceId, domain]);
  const [mon] = useLoad<MonitoringStatus | null>(() => getMonitoringStatus(serviceId), [serviceId]);

  const domainList = ok(domains)?.domains.map((d) => d.name) ?? [];
  const unknownDomain = ok(domains) != null && domainList.length > 0 && !domainList.includes(domain);
  const sslRow = ok(ssl)?.rows.find((r) => r.domain === domain) ?? null;
  const boxes = useMemo(
    () => (ok(mail)?.rows ?? []).filter((m) => m.email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)),
    [mail, domain],
  );
  const monitor = ok(mon)?.domain === domain ? ok(mon) : null;
  const records: HostingDnsRecordDto[] = ok(dns)?.records ?? [];
  const aRecord = records.find((r) => r.type === 'A' && (r.name === '@' || r.name === `${domain}.` || r.name === domain));

  const status: { tone: 'data' | 'warn' | 'muted'; text: string } = monitor
    ? monitor.lastStatus === 'UP'
      ? { tone: 'data', text: 'Strona działa' }
      : monitor.lastStatus === 'DOWN'
        ? { tone: 'warn', text: 'Strona nie odpowiada' }
        : { tone: 'muted', text: 'Sprawdzamy stronę' }
    : sslRow?.status === 'EXPIRED'
      ? { tone: 'warn', text: 'Certyfikat wygasł' }
      : { tone: 'muted', text: 'Bez monitoringu' };

  if (unknownDomain) {
    return (
      <div className="mx-auto max-w-[1280px]">
        <p className="rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">
          Domeny {domain} nie ma na tej usłudze.{' '}
          <Link href={`/dashboard/services/${serviceId}`} className="text-data-hi hover:underline">
            Wróć do usługi
          </Link>
        </p>
      </div>
    );
  }

  return (
    <HostingLinksProvider serviceId={serviceId}>
      <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
          <Link href="/dashboard/services" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Usługi
          </Link>
          <span aria-hidden>/</span>
          <Link href={`/dashboard/services/${serviceId}`} className="rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
            {planName ?? 'Hosting'}
          </Link>
          <span aria-hidden>/</span>
          {domainList.length > 1 ? (
            <select
              aria-label="Wybierz stronę"
              value={domain}
              onChange={(e) => router.push(`/dashboard/services/${serviceId}/sites/${encodeURIComponent(e.target.value)}`)}
              className="rounded-md border border-line-strong bg-card px-2 py-1 font-semibold text-foreground"
            >
              {domainList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <b className="font-semibold text-foreground">{domain}</b>
          )}
        </div>

        <header className="flex flex-wrap items-end justify-between gap-[18px]">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
              {ok(domains)?.primaryDomain === domain ? 'domena główna' : 'domena'} · na usłudze {planName ?? 'Hosting'}
            </div>
            <h1 className="mb-2 mt-1.5 break-words font-display text-[clamp(28px,4vw,40px)] font-extrabold leading-none tracking-[-0.03em] text-foreground">
              {domain}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-muted-foreground">
              <StatusPill tone={status.tone}>{status.text}</StatusPill>
              {ok(php)?.currentVersion ? (
                <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[5px] border border-line-strong bg-card px-2 py-0.5 font-mono text-[12.5px] font-medium text-foreground">
                  PHP {ok(php)?.currentVersion}
                </span>
              ) : null}
              {!simple ? <span className="font-mono">docroot /domains/{domain}/public_html</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className={BTN} href={`https://${domain}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-[15px] w-[15px]" />
              Otwórz stronę
            </a>
            <button type="button" className={BTN_PRIMARY} onClick={() => setTab('files')}>
              Pliki strony
            </button>
          </div>
        </header>

        <div role="tablist" className="-mt-1.5 flex gap-0.5 overflow-x-auto border-b border-line [scrollbar-width:none]">
          {SITE_TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px whitespace-nowrap border-0 border-b-2 bg-transparent px-3 py-[9px] text-sm ${
                tab === id ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <>
            <KpiStrip>
              <Kpi
                label={simple ? 'Czy strona działa' : 'Odpowiedź strony'}
                value={monitor?.lastResponseMs != null && !simple ? monitor.lastResponseMs : monitor ? (monitor.lastStatus === 'UP' ? 'Działa' : monitor.lastStatus === 'DOWN' ? 'Nie działa' : '—') : '—'}
                unit={monitor?.lastResponseMs != null && !simple ? 'ms' : undefined}
                foot={
                  <span>
                    {monitor
                      ? monitor.lastCheckedAt
                        ? `sprawdzono ${fmtDate(monitor.lastCheckedAt)}${monitor.uptime ? ` · dostępność ${Number(monitor.uptime.pct).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%` : ''}`
                        : 'pierwszy pomiar w toku'
                      : ok(mon)
                        ? `monitoring obejmuje ${ok(mon)?.domain}`
                        : 'monitoring wyłączony'}
                  </span>
                }
              />
              <Kpi
                label="Certyfikat SSL"
                value={sslRow?.daysLeft != null ? sslRow.daysLeft : ssl === undefined ? '…' : '—'}
                unit={sslRow?.daysLeft != null ? 'dni' : undefined}
                foot={<span>{sslRow ? (sslRow.status === 'NONE' ? 'brak certyfikatu' : sslRow.isLetsEncrypt ? 'Let’s Encrypt · odnawia się sam' : sslRow.issuer) : 'brak danych'}</span>}
              >
                {sslRow?.daysLeft != null ? (
                  <Meter pct={(sslRow.daysLeft / 90) * 100} tone={sslRow.status === 'VALID' ? 'data' : 'warn'} tipText={`${sslRow.daysLeft} z 90 dni\ndo wygaśnięcia`} />
                ) : null}
              </Kpi>
              <Kpi
                label="Wersja PHP"
                value={ok(php)?.currentVersion ?? (php === undefined ? '…' : '—')}
                foot={<span>{ok(php)?.slotReleases.length ? `dostępne: ${ok(php)?.slotReleases.join(', ')}` : 'ustawienie per domena'}</span>}
              />
              <Kpi
                label="Poczta w domenie"
                value={mail === undefined ? '…' : ok(mail) ? boxes.length : '—'}
                unit={ok(mail) ? (boxes.length === 1 ? 'skrzynka' : 'skrzynek') : undefined}
                foot={<span>{boxes.length ? boxes.slice(0, 2).map((b) => b.email.split('@')[0]).join(', ') : 'brak skrzynek'}</span>}
              />
            </KpiStrip>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-6">
                <section>
                  <SectionHead title="Elementy strony" />
                  <ul className="m-0 list-none rounded-[10px] border border-line bg-card p-0">
                    {(
                      [
                        ['dns', 'Domena i DNS', aRecord ? `A → ${aRecord.value}` : ok(dns)?.fetchError ? 'nie udało się odczytać strefy' : `${records.length} rekordów w strefie`, records.length ? `${records.length} rekordów` : '—'],
                        ['ssl', 'Certyfikat SSL', sslRow?.coveredNames.length ? sslRow.coveredNames.slice(0, 3).join(', ') : 'brak certyfikatu', sslRow?.daysLeft != null ? `${sslRow.daysLeft} dni` : '—'],
                        ['db', 'Bazy danych', 'bazy są wspólne dla konta', ''],
                        ['mail', 'Poczta', boxes.length ? `${boxes.length} skrzynki w tej domenie` : 'brak skrzynek', ''],
                        ['php', 'PHP', ok(php)?.currentVersion ? `wersja ${ok(php)?.currentVersion}` : 'brak danych', ''],
                      ] as [SiteTab, string, string, string][]
                    ).map(([id, t, m, r]) => (
                      <li
                        key={id}
                        tabIndex={0}
                        onClick={() => setTab(id)}
                        onKeyDown={(e) => e.key === 'Enter' && setTab(id)}
                        className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-line px-4 py-[11px] hover:bg-raised/50 [&+&]:border-t"
                      >
                        <b className="text-sm font-semibold text-foreground">{t}</b>
                        <span className="row-span-2 text-right text-[13px] text-verris-body">{r}</span>
                        <span className="text-[12.5px] text-muted-foreground">{m}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <SectionHead title="Co się działo na tej stronie" />
                  <div className="rounded-[10px] border border-line bg-card">
                    {monitor && monitor.events.length > 0 ? (
                      <ul className="m-0 list-none p-0">
                        {monitor.events.slice(0, 8).map((e) => (
                          <li key={e.id} className="flex items-start gap-3 border-line px-4 py-[11px] [&+&]:border-t">
                            <span className={`mt-1.5 h-[7px] w-[7px] flex-none rounded-full ${e.type === 'DOWN' ? 'bg-warn' : 'bg-data'}`} />
                            <span className="min-w-0 flex-1 text-sm text-verris-body">
                              <b className="font-semibold text-foreground">{e.type === 'DOWN' ? 'Strona przestała odpowiadać' : 'Strona znów działa'}</b>
                              {e.message ? <span className="block text-[12.5px] text-muted-foreground">{e.message}</span> : null}
                            </span>
                            <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{fmtDate(e.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="m-0 px-4 py-[22px] text-sm text-muted-foreground">
                        {monitor ? 'Bez przerw w działaniu — nic do pokazania.' : 'Historia pojawi się, gdy monitoring obejmie tę domenę.'}
                      </p>
                    )}
                  </div>
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-6">
                <section>
                  <SectionHead title="Narzędzia strony" desc="Najczęstsze rzeczy przy tej domenie." />
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line">
                    {(
                      [
                        ['Pliki strony', 'menedżer plików w przeglądarce', () => setTab('files')],
                        ['Przekierowania', 'np. stary adres → nowy', () => setTab('redirects')],
                        ['Wersja PHP', ok(php)?.currentVersion ? `teraz ${ok(php)?.currentVersion}` : 'dla tej domeny', () => setTab('php')],
                        ['Rekordy DNS', 'z gotowymi zestawami', () => setTab('dns')],
                        ['Aplikacje 1-click', 'np. WordPress', () => router.push(`/dashboard/services/${serviceId}?tab=apps`)],
                        ['Kopie zapasowe', 'przywróć pliki lub bazę', () => router.push(`/dashboard/services/${serviceId}?tab=backups`)],
                      ] as [string, string, () => void][]
                    ).map(([b, s, go]) => (
                      <button key={b} type="button" onClick={go} className="flex flex-col gap-0.5 border-0 bg-card px-3.5 py-3 text-left hover:bg-raised">
                        <b className="text-sm font-semibold text-foreground">{b}</b>
                        <small className="text-[12.5px] text-muted-foreground">{s}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : null}

        {tab === 'dns' ? (
          <section>
            <SectionHead title={`Rekordy DNS · ${domain}`} desc="Zmiany działają zwykle w kilka minut." />
            {ok(dns)?.fetchError ? <p className="mb-3 text-[13.5px] text-warn">Nie udało się odczytać strefy — spróbuj za chwilę.</p> : null}
            {dns === undefined ? <Loading /> : <DnsManager serviceId={serviceId} domain={domain} records={records} onChanged={reloadDns} />}
          </section>
        ) : null}

        {tab === 'ssl' ? <SslSection serviceId={serviceId} domain={domain} row={sslRow} loading={ssl === undefined} onChanged={reloadSsl} simple={simple} /> : null}

        {tab === 'files' ? (
          <section>
            <SectionHead title="Pliki strony" desc={`Katalog /domains/${domain}/public_html.`} />
            <FileManagerClient serviceId={serviceId} domain={domain} />
          </section>
        ) : null}

        {tab === 'db' ? (
          <section>
            <SectionHead title="Bazy danych" desc="Bazy są wspólne dla całego konta — każda strona może używać dowolnej z nich." />
            <DatabasesTab serviceId={serviceId} />
          </section>
        ) : null}

        {tab === 'mail' ? (
          <section>
            <SectionHead
              title={`Poczta w domenie ${domain}`}
              action={
                <Link href={`/dashboard/services/${serviceId}?tab=mail`} className={`${BTN} ${BTN_SM}`}>
                  Zarządzaj pocztą
                </Link>
              }
            />
            {mail === undefined ? (
              <Loading />
            ) : boxes.length === 0 ? (
              <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">W tej domenie nie ma skrzynek.</p>
            ) : (
              <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
                <table className="v2-stack w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>Adres</th>
                      <th className={TH}>Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((b) => (
                      <tr key={b.id}>
                        <td className={TD} data-label="Adres">
                          <b className="font-semibold text-foreground">{b.email}</b>
                        </td>
                        <td className={`${TD} whitespace-nowrap`} data-label="Limit">{b.quotaMb ? `${(b.quotaMb / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} GB` : 'bez limitu'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'php' ? <PhpSection serviceId={serviceId} domain={domain} php={ok(php)} loading={php === undefined} onChanged={reloadPhp} /> : null}

        {tab === 'redirects' ? (
          <section>
            <SectionHead title="Przekierowania i narzędzia WWW" desc="Ustawienia obejmują całe konto; ścieżki wpisuj względem domeny." />
            <WebToolsTab serviceId={serviceId} />
          </section>
        ) : null}
      </div>
    </HostingLinksProvider>
  );
}

function Loading() {
  return (
    <p className="flex items-center gap-2 py-6 text-[13.5px] text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
    </p>
  );
}

function SslSection({
  serviceId,
  domain,
  row,
  loading,
  onChanged,
  simple,
}: {
  serviceId: string;
  domain: string;
  row: HostingSslResponseDto['rows'][number] | null;
  loading: boolean;
  onChanged: () => void;
  simple: boolean;
}) {
  const [pending, start] = useTransition();
  const issue = () =>
    start(async () => {
      const r = await requestLetsEncryptSslAction(serviceId, domain, true);
      if (r.ok) {
        toast.success('Certyfikat zamówiony — pojawi się w ciągu kilku minut.');
        onChanged();
      } else toast.error(r.error ?? 'Nie udało się zamówić certyfikatu.');
    });
  return (
    <section>
      <SectionHead
        title="Certyfikat SSL"
        desc="Let’s Encrypt odnawia się sam przed końcem ważności. Nic nie musisz robić."
        action={
          <button type="button" className={`${BTN} ${BTN_SM}`} onClick={issue} disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {row && row.status !== 'NONE' ? 'Wystaw ponownie' : 'Wystaw certyfikat'}
          </button>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <Box title={row?.isLetsEncrypt ? 'Let’s Encrypt' : row && row.status !== 'NONE' ? row.issuer : 'Brak certyfikatu'}>
          <ul className="m-0 list-none p-0">
            <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-[11px]">
              <b className="text-sm font-semibold text-foreground">Ważność</b>
              <span className="row-span-2 text-right text-[13px] tabular-nums">{row?.daysLeft != null ? `${row.daysLeft} dni` : '—'}</span>
              <span className="text-[12.5px] text-muted-foreground">
                {row?.coveredNames.length ? `obejmuje ${row.coveredNames.join(', ')}` : 'strona otwiera się bez kłódki'}
                {row?.daysLeft != null ? <Meter pct={(row.daysLeft / 90) * 100} tone={row.status === 'VALID' ? 'data' : 'warn'} tipText={`${row.daysLeft} z 90 dni\ndo wygaśnięcia`} /> : null}
              </span>
            </li>
            {row?.expiresAt && !simple ? (
              <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-t border-line px-4 py-[11px]">
                <b className="text-sm font-semibold text-foreground">Wygasa</b>
                <span className="text-right font-mono text-[13px]">{new Date(row.expiresAt).toLocaleDateString('pl-PL')}</span>
              </li>
            ) : null}
          </ul>
        </Box>
      )}
    </section>
  );
}

function PhpSection({
  serviceId,
  domain,
  php,
  loading,
  onChanged,
}: {
  serviceId: string;
  domain: string;
  php: DomainPhpStatus | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const change = useCallback(
    (v: string) =>
      start(async () => {
        const r = await setDomainPhp(serviceId, domain, v);
        if (r.ok) {
          toast.success(`PHP ${v} ustawione dla ${domain}.`);
          onChanged();
        } else toast.error(r.error);
      }),
    [serviceId, domain, onChanged],
  );
  return (
    <section>
      <SectionHead
        title="PHP i serwer"
        desc="Wersja PHP tylko dla tej domeny. Pozostałe ustawienia serwera są w zakładce usługi."
        action={
          <Link href={`/dashboard/services/${serviceId}?tab=php`} className={`${BTN} ${BTN_SM}`}>
            Ustawienia PHP konta
          </Link>
        }
      />
      {loading ? (
        <Loading />
      ) : !php ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">Nie udało się odczytać wersji PHP.</p>
      ) : (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
          {php.slotReleases.map((v) => {
            const on = v === php.currentVersion;
            return (
              <button
                key={v}
                type="button"
                disabled={pending || on}
                aria-pressed={on}
                onClick={() => change(v)}
                className={`flex flex-col gap-0.5 border-0 px-3.5 py-3 text-left ${on ? 'bg-data-soft' : 'bg-card hover:bg-raised'} disabled:cursor-default`}
              >
                <b className="font-mono text-sm font-semibold text-foreground">PHP {v}</b>
                <small className={`text-[12.5px] ${on ? 'text-data-hi' : 'text-muted-foreground'}`}>{on ? 'używana teraz' : 'przełącz'}</small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

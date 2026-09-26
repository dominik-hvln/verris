'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Database,
  FileText,
  Globe,
  HardDrive,
  Loader2,
  Mail,
  Network,
  RefreshCw,
  Server,
  TerminalSquare,
  Wifi,
} from 'lucide-react';
import type { ConnectionMetricDto, ServiceConnectionInfoDto } from '@verris/contracts';
import { fetchConnectionInfoAction } from '@/app/dashboard/services/[id]/hosting-connection-actions';
import { liczba } from '@/lib/liczba';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Kopiuj ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="shrink-0 rounded-md border border-line p-1 text-muted-foreground hover:text-foreground hover:bg-raised"
    >
      {copied ? <Check className="h-3 w-3 text-data-hi" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  copy,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  copy?: string | null;
  muted?: boolean;
}) {
  return (
    <div className="py-2">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p
            className={`break-all font-mono text-[12px] leading-snug ${muted ? 'text-muted-foreground' : 'text-[color:var(--verris-body)]'}`}
            title={value}
          >
            {value}
          </p>
        </div>
        {copy ? <CopyButton value={copy} label={label} /> : null}
      </div>
    </div>
  );
}

function gb(mb: number): string {
  const v = mb / 1024;
  return `${Number.isInteger(v) ? v : liczba(v, 1)} GB`;
}

function metricText(m: ConnectionMetricDto, kind: 'mb' | 'count'): { used: string; limit: string } {
  if (kind === 'mb') {
    return {
      used: m.used == null ? '—' : gb(m.used),
      limit: m.limit == null ? '∞' : gb(m.limit),
    };
  }
  return {
    used: m.used == null ? '—' : String(Math.round(m.used)),
    limit: m.limit == null ? '∞' : String(Math.round(m.limit)),
  };
}

function pct(m: ConnectionMetricDto): number | null {
  if (m.used == null || m.limit == null || m.limit <= 0) return null;
  return Math.max(0, Math.min(100, (m.used / m.limit) * 100));
}

function MetricRow({
  icon: Icon,
  label,
  metric,
  kind,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  metric: ConnectionMetricDto;
  kind: 'mb' | 'count';
}) {
  const t = metricText(metric, kind);
  const p = pct(metric);
  const danger = p != null && p >= 90;
  const warn = p != null && p >= 75 && p < 90;
  const barColor = danger ? 'bg-crit/12' : warn ? 'bg-warn-soft' : 'bg-data-soft';
  return (
    <div className="py-1.5">
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{label}</span>
        <span className="shrink-0 text-right text-[12px] text-[color:var(--verris-body)]">
          <span className="font-semibold text-foreground">{t.used}</span>
          <span className="text-muted-foreground"> / {t.limit}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: p == null ? '6%' : `${Math.max(2, p)}%` }}
        />
      </div>
    </div>
  );
}

/** Stały panel boczny — dane dostępowe usługi (IP/FTP/poczta/SSH/NS + limity). */
export default function ServiceConnectionCard({
  serviceId,
  productKind = 'HOSTING',
}: {
  serviceId: string;
  productKind?: 'HOSTING' | 'EMAIL';
}) {
  const isEmail = productKind === 'EMAIL';
  const [info, setInfo] = useState<ServiceConnectionInfoDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Samo pobranie (błędy łapie w środku) — bez przełączania spinnera.
  const fetchInfo = useCallback(
    () =>
      fetchConnectionInfoAction(serviceId)
        .then((data) => {
          setInfo(data);
          setError(null);
        })
        .catch((e) => {
          // Surface the failure (unless we already have data from a prior load,
          // in which case keep showing it and don't replace with an error card).
          setError(e instanceof Error ? e.message : 'Nie udało się pobrać danych dostępowych.');
        }),
    [serviceId],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      await fetchInfo();
      if (!silent) setLoading(false);
    },
    [fetchInfo],
  );

  // Montaż: `loading` jest już true, więc tylko pobieramy i gasimy spinner.
  useEffect(() => {
    void fetchInfo().then(() => setLoading(false));
  }, [fetchInfo]);

  useEffect(() => {
    const id = setInterval(() => void load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-[10px] border border-line bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Dane dostępowe…
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="rounded-[10px] border border-line bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="rounded-[10px] border border-line bg-raised p-2 text-foreground">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Dane dostępowe</h2>
            <p className="text-[11px] text-muted-foreground">Adresy serwera i limity konta</p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? 'Dane dostępowe będą widoczne po aktywacji konta hostingowego.'}</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-line px-3 py-1.5 text-[12px] text-[color:var(--verris-body)] hover:bg-raised"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Spróbuj ponownie
        </button>
      </div>
    );
  }

  const ns = info.nameservers.filter(Boolean);

  return (
    <div className="rounded-[10px] border border-line bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-[10px] border border-line bg-raised p-2 text-foreground">
          <Network className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Dane dostępowe</h2>
          <p className="text-[11px] text-muted-foreground">Adresy serwera i limity konta</p>
        </div>
      </div>

      <div className="rounded-[10px] border border-line bg-background px-3 py-1 divide-y divide-line">
        <InfoRow icon={Server} label="IP serwera" value={info.ipv4 ?? '—'} copy={info.ipv4} />
        {/* FTP/SSH dotyczą hostingu WWW — ukrywamy dla usług poczty. */}
        {!isEmail ? (
          <InfoRow icon={Wifi} label="Serwer FTP" value={info.ftpHost ?? '—'} copy={info.ftpHost} />
        ) : null}
        <InfoRow icon={Mail} label="Poczta" value={info.mailHost ?? '—'} copy={info.mailHost} />
        {!isEmail ? (
          <InfoRow
            icon={TerminalSquare}
            label="SSH"
            muted={!info.sshEnabled}
            value={
              info.sshEnabled
                ? `${info.sshHost ?? ''}${info.sshPort ? `:${info.sshPort}` : ''} (aktywny)`
                : 'nieaktywny'
            }
          />
        ) : null}
      </div>

      {ns.length > 0 ? (
        <div className="rounded-[10px] border border-line bg-background px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Globe className="h-3 w-3" /> Serwery DNS
          </p>
          <div className="space-y-1">
            {ns.map((host) => (
              <div key={host} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-all font-mono text-[12px] text-[color:var(--verris-body)]">
                  {host}
                </span>
                <CopyButton value={host} label="NS" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-[10px] border border-line bg-background px-3 py-1.5 divide-y divide-line">
        <MetricRow icon={HardDrive} label="Miejsce na dysku" metric={info.diskMb} kind="mb" />
        <MetricRow icon={Wifi} label="Transfer" metric={info.bandwidthMb} kind="mb" />
        <MetricRow icon={Mail} label="E-maile" metric={info.emails} kind="count" />
        {/* FTP/bazy/inody dotyczą hostingu WWW — ukrywamy dla poczty. */}
        {!isEmail ? (
          <>
            <MetricRow icon={Server} label="Konta FTP" metric={info.ftpAccounts} kind="count" />
            <MetricRow icon={Database} label="Bazy danych" metric={info.databases} kind="count" />
            <MetricRow icon={FileText} label="Liczba plików" metric={info.inodes} kind="count" />
          </>
        ) : null}
      </div>

      {info.fetchError ? (
        <p className="text-[11px] text-warn">{info.fetchError}</p>
      ) : null}
    </div>
  );
}

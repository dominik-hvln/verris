'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Server,
} from 'lucide-react';
import type { HostingDnsPointingDto } from '@verris/contracts';
import { Button } from '@verris/ui';
import {
  fetchDomainPointingAction,
  verifyDomainPointingAction,
} from '@/app/dashboard/services/[id]/hosting-dns-pointing-actions';

const STATUS_STYLES: Record<
  HostingDnsPointingDto['status'],
  { border: string; bg: string; text: string; dot: string }
> = {
  ok: {
    border: 'border-emerald-400/30',
    bg: 'bg-emerald-400/10',
    text: 'text-emerald-200',
    dot: 'bg-emerald-400',
  },
  partial: {
    border: 'border-amber-400/30',
    bg: 'bg-amber-400/10',
    text: 'text-amber-200',
    dot: 'bg-amber-400',
  },
  fail: {
    border: 'border-rose-400/30',
    bg: 'bg-rose-400/10',
    text: 'text-rose-200',
    dot: 'bg-rose-400',
  },
  pending: {
    border: 'border-white/15',
    bg: 'bg-white/[0.03]',
    text: 'text-neutral-400',
    dot: 'bg-neutral-500',
  },
};

const STATUS_LABELS: Record<HostingDnsPointingDto['status'], string> = {
  ok: 'Domena poprawnie skierowana',
  partial: 'Konfiguracja niepełna',
  fail: 'Domena nie wskazuje na hosting',
  pending: 'Oczekiwanie',
};

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Kopiuj"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="rounded-md border border-white/10 p-1 text-neutral-400 hover:text-white"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function DomainPointingPanel({
  serviceId,
  dnsManageUrl,
  variant = 'full',
  onGoToDomains,
}: {
  serviceId: string;
  dnsManageUrl?: string | null;
  variant?: 'compact' | 'full';
  onGoToDomains?: () => void;
}) {
  const [data, setData] = useState<HostingDnsPointingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(variant === 'full');
  const [autoPoll, setAutoPoll] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchDomainPointingAction(serviceId));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  const verify = useCallback(async () => {
    setVerifying(true);
    try {
      setData(await verifyDomainPointingAction(serviceId));
    } finally {
      setVerifying(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoPoll || data?.status === 'ok') return;
    const id = window.setInterval(() => void verify(), 30_000);
    return () => window.clearInterval(id);
  }, [autoPoll, data?.status, verify]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Sprawdzanie DNS…
      </div>
    );
  }

  if (!data?.domain || !data.expectedIpv4) {
    return (
      <p className="text-xs text-neutral-500">
        Weryfikator DNS będzie dostępny po aktywacji usługi.
      </p>
    );
  }

  const st = STATUS_STYLES[data.status];

  return (
    <div className={`rounded-xl border ${st.border} ${st.bg} p-4 space-y-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${st.dot} ${verifying ? 'animate-pulse' : ''}`} />
            <p className={`text-sm font-semibold ${st.text}`}>{STATUS_LABELS[data.status]}</p>
          </div>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{data.message}</p>
          <p className="text-[10px] text-neutral-600 mt-1">
            Ostatnia weryfikacja: {new Date(data.checkedAt).toLocaleString('pl-PL')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={verifying}
            onClick={() => void verify()}
            className="h-8 gap-1.5 border-white/15 text-white text-xs"
          >
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sprawdź teraz
          </Button>
          {data.status !== 'ok' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAutoPoll((v) => !v)}
              className={`h-8 text-xs border-white/15 ${autoPoll ? 'text-cyan-200 border-cyan-400/40' : 'text-white'}`}
            >
              {autoPoll ? 'Auto: wł.' : 'Auto: wył.'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Wykryte NS ({data.domain})</p>
          <p className="font-mono text-white mt-1 break-all">
            {data.nameservers.length ? data.nameservers.join(', ') : '— brak —'}
          </p>
          {data.expectedNameservers.length ? (
            <p className="text-[10px] text-neutral-500 mt-1">
              Oczekiwane NS:{' '}
              <span className="break-all font-mono">{data.expectedNameservers.join(', ')}</span>
            </p>
          ) : null}
          <p className="text-[10px] mt-1 text-neutral-400">
            Tryb NS: {data.delegatedToExpectedNs ? 'poprawny' : 'niepotwierdzony'}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Wykryte A ({data.domain})</p>
          <p className="font-mono text-white mt-1 break-all">
            {data.observedA.length ? data.observedA.join(', ') : '— brak —'}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Oczekiwany serwer</p>
          <div className="flex items-center gap-2 mt-1">
            <Server className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
            <span className="font-mono text-white">{data.expectedIpv4}</span>
            <CopyBtn value={data.expectedIpv4} />
          </div>
          {data.serverName ? (
            <p className="text-[10px] text-neutral-500 mt-1">Serwer hostingu Verris</p>
          ) : null}
        </div>
      </div>

      {data.issues.length > 0 ? (
        <ul className="space-y-1">
          {data.issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2 text-xs text-amber-100/90">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {issue}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => setWizardOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold text-white py-1"
        >
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Jak skierować domenę na hosting
          </span>
          {wizardOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {wizardOpen ? (
          <ol className="mt-3 space-y-3 text-xs text-neutral-300">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">
                1
              </span>
              <div>
                <p className="font-medium text-white">Zaloguj się u rejestratora domeny</p>
                <p className="text-neutral-400 mt-0.5">
                  OVH, home.pl, Cloudflare, Aftermarket itd. → zarządzanie strefą DNS / rekordy.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">
                2
              </span>
              <div>
                <p className="font-medium text-white">Wybierz 1 z 2 wariantów konfiguracji</p>
                <p className="text-neutral-400 mt-0.5">
                  Wariant A: delegacja domeny na nameservery hostingu (zalecane, pełna obsługa DNS/mail z panelu).
                </p>
                {data.expectedNameservers.length ? (
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[11px] text-neutral-200 space-y-1">
                    {data.expectedNameservers.map((ns) => (
                      <p key={ns}>
                        <span className="text-neutral-500">NS:</span> {ns}
                      </p>
                    ))}
                  </div>
                ) : null}
                <p className="text-neutral-400 mt-2">
                  Wariant B: zostaw obecne NS i ustaw rekordy A/AAAA ręcznie (np. gdy poczta zostaje u innego dostawcy).
                </p>
                <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[11px] text-neutral-200 space-y-1">
                  <p>
                    <span className="text-neutral-500">Host:</span> @ &nbsp;
                    <span className="text-neutral-500">Typ:</span> A &nbsp;
                    <span className="text-neutral-500">Wartość:</span> {data.expectedIpv4}
                  </p>
                  <p>
                    <span className="text-neutral-500">TTL:</span> 300–3600 (niższe = szybsza propagacja)
                  </p>
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">
                3
              </span>
              <div>
                <p className="font-medium text-white">Opcjonalnie: www</p>
                <p className="text-neutral-400 mt-0.5">
                  Rekord A <code className="text-neutral-300">www</code> → {data.expectedIpv4} albo CNAME{' '}
                  <code className="text-neutral-300">www</code> → {data.domain}
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">
                4
              </span>
              <div>
                <p className="font-medium text-white">Poczekaj na propagację i kliknij „Sprawdź teraz”</p>
                <p className="text-neutral-400 mt-0.5">
                  Zwykle 5–60 minut. Włącz „Auto”, aby odświeżać co 30 s. Status będzie PASS dla poprawnej delegacji NS
                  albo poprawnych rekordów A/AAAA.
                </p>
              </div>
            </li>
          </ol>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {dnsManageUrl ? (
          <a
            href={dnsManageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
          >
            Strefa DNS
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        ) : null}
        {variant === 'compact' && onGoToDomains ? (
          <button
            type="button"
            onClick={onGoToDomains}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 hover:text-white"
          >
            Szczegóły w zakładce Domeny →
          </button>
        ) : null}
      </div>
    </div>
  );
}

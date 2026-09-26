'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, HelpCircle, Loader2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceHealthCheckDetailDto, ServiceHealthCheckKey, ServiceHealthSummaryDto } from '@verris/contracts';
import { requestLetsEncryptSslAction } from '@/app/dashboard/services/[id]/hosting-ssl-actions';
import { requestHostingSiteBackupAction } from '@/app/dashboard/hosting-site-backup-action';

const CHECK_ORDER: ServiceHealthCheckKey[] = [
  'dnsOk',
  'tlsOk',
  'mailOk',
  'panelTlsOk',
  'lveOk',
  'backupFresh',
];

const CHECK_FROM_BOOL: Record<ServiceHealthCheckKey, keyof ServiceHealthSummaryDto['checks']> = {
  dnsOk: 'dnsOk',
  tlsOk: 'tlsOk',
  mailOk: 'mailOk',
  panelTlsOk: 'panelTlsOk',
  lveOk: 'lveOk',
  backupFresh: 'backupFresh',
};

function pillFromDetail(d: ServiceHealthCheckDetailDto) {
  if (d.status === 'ok') {
    return {
      className: 'border-data/28 bg-data-soft text-data-hi',
      label: 'OK',
    };
  }
  if (d.status === 'warn') {
    return {
      className: 'border-warn/30 bg-warn-soft text-warn',
      label: 'Uwaga',
    };
  }
  return {
    className: 'border-line-strong bg-raised text-muted-foreground',
    label: '—',
  };
}

function fallbackDetail(
  key: ServiceHealthCheckKey,
  ok: boolean | null,
): ServiceHealthCheckDetailDto | null {
  if (ok === null) return null;
  const labels: Record<ServiceHealthCheckKey, string> = {
    dnsOk: 'DNS',
    tlsOk: 'HTTPS',
    mailOk: 'Poczta',
    panelTlsOk: 'Panel hostingu',
    lveOk: 'Obciążenie CPU',
    backupFresh: 'Kopia zapasowa',
  };
  return ok
    ? {
        status: 'ok',
        label: labels[key],
        explanation: 'Parametr w normie.',
        whatToDo: 'Brak działań.',
      }
    : {
        status: 'warn',
        label: labels[key],
        explanation: 'Wykryto problem — odśwież diagnostykę, aby zobaczyć szczegóły.',
        whatToDo: 'Kliknij „Odśwież” powyżej. Jeśli problem się utrzymuje, utwórz zgłoszenie do supportu.',
      };
}

/**
 * GUIDE-3 — przycisk „Napraw jednym kliknięciem". Dla checków, które potrafimy
 * naprawić realną akcją (SSL → Let's Encrypt, kopia → backup) wykonujemy ją od
 * razu; dla pozostałych prowadzimy do właściwej zakładki.
 */
function QuickFix({
  checkKey,
  serviceId,
  domain,
  onNavigate,
}: {
  checkKey: ServiceHealthCheckKey;
  serviceId: string;
  domain: string | null;
  onNavigate?: (tab: string) => void;
}) {
  const [pending, start] = useTransition();

  if (checkKey === 'tlsOk' && domain) {
    return (
      <FixButton
        pending={pending}
        label="Napraw: wystaw certyfikat SSL"
        onClick={() =>
          start(async () => {
            const res = await requestLetsEncryptSslAction(serviceId, domain, true);
            if (res.ok) toast.success('Zlecono wystawienie certyfikatu Let’s Encrypt', {
              description: 'Certyfikat pojawi się zwykle w kilka minut (po poprawnym DNS).',
            });
            else toast.error('Nie udało się zlecić SSL', { description: res.error });
          })
        }
      />
    );
  }
  if (checkKey === 'backupFresh') {
    return (
      <FixButton
        pending={pending}
        label="Napraw: uruchom kopię zapasową"
        onClick={() =>
          start(async () => {
            const res = await requestHostingSiteBackupAction(serviceId);
            if ('ok' in res) toast.success('Zlecono kopię zapasową', {
              description: 'Kopia pojawi się na liście po zakończeniu.',
            });
            else toast.error('Nie udało się zlecić kopii', { description: res.error });
          })
        }
      />
    );
  }
  if (!onNavigate) return null;
  if (checkKey === 'dnsOk') {
    return <FixButton label="Przejdź do Domeny & DNS" onClick={() => onNavigate('domains')} />;
  }
  if (checkKey === 'mailOk') {
    return <FixButton label="Przejdź do Poczty" onClick={() => onNavigate('mail')} />;
  }
  return null;
}

function FixButton({
  label,
  onClick,
  pending,
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="mt-2 inline-flex items-center gap-1.5 rounded-[7px] border border-data/28 bg-data-soft px-3 py-1.5 text-xs font-semibold text-data-hi hover:bg-data-soft disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

export function HealthCheckDetails({
  health,
  serviceId,
  domain,
  onNavigate,
}: {
  health: ServiceHealthSummaryDto;
  serviceId?: string;
  domain?: string | null;
  onNavigate?: (tab: string) => void;
}) {
  const [openKey, setOpenKey] = useState<ServiceHealthCheckKey | null>(() => {
    for (const key of CHECK_ORDER) {
      const ok = health.checks[CHECK_FROM_BOOL[key]];
      if (ok === false) return key;
    }
    return null;
  });

  const items = CHECK_ORDER.map((key) => {
    const ok = health.checks[CHECK_FROM_BOOL[key]];
    if (ok === null) return null;
    const detail = health.checkDetails?.[key] ?? fallbackDetail(key, ok);
    if (!detail) return null;
    return { key, ok, detail };
  }).filter((x): x is { key: ServiceHealthCheckKey; ok: boolean; detail: ServiceHealthCheckDetailDto } => x != null);

  if (items.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
        <HelpCircle className="h-3.5 w-3.5" />
        Diagnostyka — kliknij wiersz, aby zobaczyć szczegóły i co zrobić
      </p>
      <ul className="space-y-1.5">
        {items.map(({ key, detail }) => {
          const pill = pillFromDetail(detail);
          const expanded = openKey === key;
          const warn = detail.status === 'warn';
          return (
            <li
              key={key}
              className={`rounded-[10px] border overflow-hidden transition-colors ${
                warn ? 'border-warn/30 bg-warn-soft' : 'border-line bg-raised'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenKey(expanded ? null : key)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-raised"
              >
                {warn ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-warn" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-data-hi" />
                )}
                <span className="flex-1 min-w-0 text-sm font-medium text-foreground break-words">
                  {detail.label}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${pill.className}`}
                >
                  {pill.label}
                </span>
                {expanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {expanded ? (
                <div className="px-3 pb-3 pt-0 space-y-2 border-t border-line">
                  <p className="text-xs text-[color:var(--verris-body)] leading-relaxed">{detail.explanation}</p>
                  <div className="rounded-[7px] bg-raised border border-line px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                      Co możesz zrobić
                    </p>
                    <p className="text-xs text-[color:var(--verris-body)] leading-relaxed">{detail.whatToDo}</p>
                  </div>
                  {detail.status === 'warn' && serviceId ? (
                    <QuickFix
                      checkKey={key}
                      serviceId={serviceId}
                      domain={domain ?? null}
                      onNavigate={onNavigate}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

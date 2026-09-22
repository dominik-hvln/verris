'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Select } from '@/components/panel';
import { CopyValue, Label, SectionHead, StatusPill } from '@/components/panel/v2';
import { createDnsRecordAction, editDnsRecordAction } from '@/app/dashboard/dns/dns-actions';
import { DMARC_POLICIES, dmarcPolicyOf, dmarcRuaOf, isEmail, tuneDmarc, type DmarcPolicy } from '@/lib/dmarc';
import { fetchDeliverability, type DeliverabilityCheck, type DeliverabilityReport } from './deliverability-actions';

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 text-data-hi" aria-label="w porządku" />,
  warn: <AlertTriangle className="h-4 w-4 text-warn" aria-label="do poprawy" />,
  fail: <XCircle className="h-4 w-4 text-destructive" aria-label="błąd" />,
};

/**
 * E-15/E-16/E-17 — kreator SPF / DKIM / DMARC: stan z publicznego DNS i gotowy
 * rekord do dodania jednym kliknięciem (gdy domena używa DNS Verris) albo do
 * skopiowania u zewnętrznego dostawcy DNS.
 */
export function DeliverabilityPanel({ serviceId }: { serviceId: string }) {
  const [report, setReport] = useState<DeliverabilityReport | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const load = () =>
    startTransition(async () => {
      const r = await fetchDeliverability(serviceId);
      setReport(r);
      if (!r) toast.error('Nie udało się sprawdzić dostarczalności');
    });
  useEffect(load, [serviceId]);

  return (
    <section className="mt-6">
      <SectionHead
        title={
          <span className="inline-flex items-center gap-2">
            Dostarczalność poczty
            {report ? (
              <StatusPill tone={report.score >= 80 ? 'data' : report.score >= 50 ? 'muted' : 'warn'}>{report.score}/100</StatusPill>
            ) : null}
          </span>
        }
        desc="SPF, DKIM i DMARC mówią serwerom odbiorców, że poczta z Twojej domeny jest prawdziwa. Bez nich wiadomości częściej lądują w spamie."
        action={
          <button
            type="button"
            onClick={load}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs text-foreground hover:bg-raised disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sprawdź ponownie
          </button>
        }
      />

      {report === undefined ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Sprawdzamy rekordy DNS domeny…
        </p>
      ) : !report ? (
        <p className="text-sm text-muted-foreground">Nie udało się sprawdzić — spróbuj ponownie za chwilę.</p>
      ) : !report.domain ? (
        <p className="text-sm text-muted-foreground">Konto nie ma jeszcze domeny.</p>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-muted-foreground">
            Domena <span className="font-mono text-foreground">{report.domain}</span>
            {report.sendingIp ? (
              <>
                {' '}
                · serwer wysyłki <span className="font-mono text-foreground">{report.sendingIp}</span>
              </>
            ) : null}
            {report.usesPlatformDns === false ? ' · DNS domeny jest u innego dostawcy' : null}
            {report.usesPlatformDns === true ? ' · DNS domeny w Verris' : null}
          </p>
          <div className="space-y-2">
            {report.checks.map((c) => (
              <CheckRow key={c.key} check={c} report={report} serviceId={serviceId} onChanged={load} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CheckRow({
  check,
  report,
  serviceId,
  onChanged,
}: {
  check: DeliverabilityCheck;
  report: DeliverabilityReport;
  serviceId: string;
  onChanged: () => void;
}) {
  const s = check.suggestion;
  const isDmarc = check.key === 'dmarc' && !!s;
  const [policy, setPolicy] = useState<DmarcPolicy>(() => dmarcPolicyOf(s?.value ?? ''));
  const [rua, setRua] = useState(() => dmarcRuaOf(s?.value ?? ''));
  const [saving, setSaving] = useState(false);
  const ruaBad = rua.trim() !== '' && !isEmail(rua.trim());
  const value = s ? (isDmarc ? tuneDmarc(s.value, policy, rua) : s.value) : '';
  const canWrite = !!s && !s.inZone && report.usesPlatformDns !== false && !!report.domain;

  const save = async () => {
    if (!s || !report.domain) return;
    setSaving(true);
    const next = { name: s.host, type: s.type, value, ttl: 3600 };
    const res = s.replaces
      ? await editDnsRecordAction({ serviceId, domain: report.domain, old: s.replaces, next })
      : await createDnsRecordAction({ serviceId, domain: report.domain, ...next });
    setSaving(false);
    if (!res.ok) {
      toast.error('Nie udało się zapisać rekordu', { description: res.error });
      return;
    }
    toast.success(`Rekord ${check.label} zapisany`, { description: 'Serwery na świecie mogą go widzieć dopiero po kilku minutach.' });
    onChanged();
  };

  return (
    <div className="rounded-[10px] border border-line bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">{ICON[check.status]}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{check.label}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{check.detail}</p>
          {check.key === 'dkim' && !s && check.status !== 'ok' ? (
            <Link href="/dashboard/support/new" className="mt-1 inline-block text-[13px] text-primary hover:underline">
              Napisz zgłoszenie
            </Link>
          ) : null}

          {s ? (
            <div className="mt-3 space-y-3 rounded-lg border border-line bg-raised/40 p-3">
              {isDmarc ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <Label>Co robić z fałszywą pocztą</Label>
                    <Select value={policy} onChange={(v) => setPolicy(v as DmarcPolicy)} aria-label="Polityka DMARC" options={DMARC_POLICIES} />
                  </label>
                  <label className="space-y-1">
                    <Label>Raporty na adres (opcjonalnie)</Label>
                    <input
                      value={rua}
                      onChange={(e) => setRua(e.target.value)}
                      placeholder={`dmarc@${report.domain}`}
                      aria-invalid={ruaBad}
                      className="w-full rounded-lg border border-line-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    {ruaBad ? <span className="text-xs text-destructive">Niepoprawny adres e-mail.</span> : null}
                  </label>
                </div>
              ) : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-muted-foreground">Typ</dt>
                <dd className="font-mono text-foreground">{s.type}</dd>
                <dt className="text-muted-foreground">Host</dt>
                <dd>
                  <CopyValue value={s.host} />
                </dd>
                <dt className="text-muted-foreground">Wartość</dt>
                <dd className="min-w-0">
                  <CopyValue value={value} />
                </dd>
              </dl>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || ruaBad}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {s.replaces ? 'Zamień rekord w DNS' : 'Dodaj rekord do DNS'}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Domena korzysta z DNS u innego dostawcy (np. rejestratora) — dodaj tam ten rekord. Kliknij wartość, aby ją skopiować.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

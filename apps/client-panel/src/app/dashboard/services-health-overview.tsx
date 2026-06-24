import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { ServiceSummaryDto } from '@verris/contracts';

/**
 * Dashboard zdrowia usług — agregat stanu wszystkich usług klienta w jednym
 * miejscu. Działa wyłącznie na danych, które API już zwraca w /services
 * (health.checks + recommendations + status), więc nie dokłada żadnych zapytań.
 *
 * Cel: klient od razu widzi, co wymaga jego uwagi (DNS, SSL, backup, obciążenie,
 * konto nieaktywne) z bezpośrednim skrótem do właściwej usługi.
 */

interface ServiceIssue {
  service: ServiceSummaryDto;
  label: 'attention' | 'critical';
  reasons: string[];
}

function deriveReasons(s: ServiceSummaryDto): string[] {
  const reasons: string[] = [];
  // Konto powiązane, ale nieaktywne (zawieszone / w trakcie) — najważniejsze.
  if (s.account && s.account.status !== 'ACTIVE') reasons.push('Konto nieaktywne');
  if (s.provisioning?.stage === 'failed') reasons.push('Provisioning wymaga uwagi');

  const c = s.health?.checks;
  if (c) {
    const isEmail = s.productKind === 'EMAIL';
    if (c.dnsOk === false) reasons.push(isEmail ? 'DNS poczty (MX/SPF/DKIM)' : 'DNS domeny');
    if (!isEmail && c.tlsOk === false) reasons.push('Certyfikat SSL');
    if (c.mailOk === false) reasons.push('Serwer poczty');
    if (c.lveOk === false) reasons.push('Wysokie obciążenie');
    if (c.backupFresh === false) reasons.push('Brak świeżej kopii');
  }
  // Rekomendacje krytyczne/ostrzeżenia jako uzupełnienie (np. autoskalowanie).
  for (const r of s.recommendations ?? []) {
    if (r.severity !== 'info' && !reasons.includes(r.title)) reasons.push(r.title);
  }
  return reasons;
}

export function ServicesHealthOverview({ services }: { services: ServiceSummaryDto[] }) {
  // Bierzemy pod uwagę tylko realnie działające usługi (z kontem) + te w trakcie.
  const relevant = services.filter((s) => s.status !== 'CANCELED' && s.status !== 'EXPIRED');
  if (relevant.length === 0) return null;

  let healthy = 0;
  const issues: ServiceIssue[] = [];
  for (const s of relevant) {
    const reasons = deriveReasons(s);
    const label = s.health?.label;
    if (reasons.length === 0 && (label === 'healthy' || label === 'pending' || label == null)) {
      healthy++;
      continue;
    }
    const sev: 'attention' | 'critical' =
      label === 'critical' || reasons.some((r) => /nieaktywne|provisioning|ssl|dns/i.test(r))
        ? 'critical'
        : 'attention';
    if (reasons.length === 0) healthy++;
    else issues.push({ service: s, label: sev, reasons });
  }

  const critical = issues.filter((i) => i.label === 'critical').length;
  const attention = issues.filter((i) => i.label === 'attention').length;

  return (
    <section>
      <div className="mb-4 mt-2 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-400" /> Zdrowie usług
        </h2>
        <Link
          href="/dashboard/services"
          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
        >
          Wszystkie usługi <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={CheckCircle2}
          tone="ok"
          value={healthy}
          label={healthy === 1 ? 'usługa sprawna' : 'usług sprawnych'}
        />
        <SummaryTile
          icon={AlertTriangle}
          tone="warn"
          value={attention}
          label={attention === 1 ? 'wymaga uwagi' : 'wymagają uwagi'}
        />
        <SummaryTile
          icon={ShieldAlert}
          tone="crit"
          value={critical}
          label={critical === 1 ? 'pilna sprawa' : 'pilnych spraw'}
        />
      </div>

      {issues.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]">
          {issues
            .sort((a, b) => (a.label === b.label ? 0 : a.label === 'critical' ? -1 : 1))
            .slice(0, 6)
            .map(({ service: s, label, reasons }) => (
              <Link
                key={s.id}
                href={`/dashboard/services/${s.id}?kind=${s.productKind}`}
                className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${label === 'critical' ? 'bg-rose-400' : 'bg-amber-400'}`}
                    />
                    <span className="truncate">{s.planName}</span>
                    {s.serviceTag ? (
                      <span className="shrink-0 font-mono text-[10px] text-neutral-500">{s.serviceTag}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-neutral-400">
                    {s.account?.domain ? `${s.account.domain} — ` : ''}
                    {reasons.slice(0, 3).join(', ')}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-neutral-500" />
              </Link>
            ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100/90">
          Wszystkie usługi działają prawidłowo — monitorujemy DNS, SSL, kopie zapasowe i obciążenie.
        </p>
      )}
    </section>
  );
}

function SummaryTile({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'ok' | 'warn' | 'crit';
  value: number;
  label: string;
}) {
  const styles =
    tone === 'ok'
      ? 'border-emerald-400/25 bg-emerald-400/5 text-emerald-300'
      : tone === 'warn'
        ? 'border-amber-400/25 bg-amber-400/5 text-amber-300'
        : 'border-rose-400/25 bg-rose-400/5 text-rose-300';
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${styles}`}>
      <Icon className="h-6 w-6 shrink-0" />
      <div>
        <p className="text-2xl font-bold leading-none text-white">{value}</p>
        <p className="mt-1 text-[11px] font-medium text-neutral-400">{label}</p>
      </div>
    </div>
  );
}

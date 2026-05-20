import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { DomainDto, ServiceSummaryDto } from '@verris/contracts';
import {
  ArrowLeft,
  Globe,
  Network,
  Database,
  FolderOpen,
  ShieldCheck,
  FolderKanban,
  Terminal,
  Mail,
  HardDriveDownload,
  Server,
  ExternalLink,
} from 'lucide-react';
import { DomainRecordActions } from './domain-record-actions';
import { fetchDomainChecklist } from '../actions';

export const dynamic = 'force-dynamic';

function hostingPath(
  path: string,
  serviceId: string,
  extras?: Record<string, string>,
): string {
  const p = new URLSearchParams({ serviceId });
  if (extras) {
    for (const [k, v] of Object.entries(extras)) p.set(k, v);
  }
  return `${path}?${p.toString()}`;
}

export default async function DomainDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let domain: DomainDto;
  let services: ServiceSummaryDto[] = [];
  let checklist: Awaited<ReturnType<typeof fetchDomainChecklist>> = [];
  try {
    [domain, services, checklist] = await Promise.all([
      apiFetch<DomainDto>(`/domains/${id}`),
      apiFetch<ServiceSummaryDto[]>('/services'),
      fetchDomainChecklist(id).catch(() => []),
    ]);
  } catch {
    return (
      <div className="mx-auto max-w-md space-y-4 p-10 text-center">
        <p className="text-neutral-400">Nie znaleziono domeny lub brak uprawnień.</p>
        <Link href="/dashboard/domains" className="text-sm text-indigo-400 hover:underline">
          ← Lista domen
        </Link>
      </div>
    );
  }

  const linked = services.find(
    (s) => s.account?.domain?.toLowerCase() === domain.name.toLowerCase(),
  );

  const toolLinks = linked
    ? [
        {
          href: hostingPath('/dashboard/dns', linked.id, { zone: domain.name }),
          label: 'Strefa DNS',
          desc: 'Rekordy DNS dla tej domeny',
          icon: Network,
        },
        {
          href: hostingPath('/dashboard/databases', linked.id),
          label: 'Bazy MySQL',
          desc: 'Listy baz na koncie hostingowym',
          icon: Database,
        },
        {
          href: hostingPath('/dashboard/file-manager', linked.id),
          label: 'Menedżer plików',
          desc: 'Pliki na hostingu',
          icon: FolderOpen,
        },
        {
          href: hostingPath('/dashboard/ssl', linked.id),
          label: 'SSL',
          desc: 'Certyfikaty SSL',
          icon: ShieldCheck,
        },
        {
          href: hostingPath('/dashboard/ftp', linked.id),
          label: 'FTP',
          icon: FolderKanban,
          desc: 'Konta FTP',
        },
        {
          href: hostingPath('/dashboard/cron', linked.id),
          label: 'Cron',
          icon: Terminal,
          desc: 'Harmonogram zadań',
        },
        {
          href: hostingPath('/dashboard/email', linked.id),
          label: 'Poczta',
          icon: Mail,
          desc: 'Skrzynki e-mail',
        },
        {
          href: hostingPath('/dashboard/backups', linked.id),
          label: 'Kopie zapasowe',
          icon: HardDriveDownload,
          desc: 'Kopie zapasowe konta',
        },
      ]
    : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Link
          href="/dashboard/domains"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#0a0a0a] text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <Globe className="h-8 w-8 text-white shrink-0" />
            <h1 className="text-2xl font-bold tracking-tight text-white break-all">{domain.name}</h1>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                domain.status === 'ACTIVE'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : domain.status === 'PENDING'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : 'border-white/15 bg-white/5 text-neutral-400'
              }`}
            >
              {domain.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Domena w portfelu Verris. Narzędzia hostingowe działają po powiązaniu z aktywną usługą (ta sama
            nazwa domeny co przy zakładaniu hostingu).
          </p>
        </div>
        <DomainRecordActions domain={domain} />
      </div>

      {!linked ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-6 text-sm text-neutral-200">
          <p className="font-medium text-amber-100">Brak powiązanej usługi hostingowej</p>
          <p className="mt-2 text-neutral-400">
            Żadna aktywna usługa nie ma tej domeny jako głównej. Zamów hosting na ten adres lub dodaj domenę
            w panelu hostingu — wtedy pojawią się linki do DNS, plików i pozostałych modułów.
          </p>
          <Link href="/dashboard/services/new" className="mt-4 inline-block text-sm text-indigo-400 hover:underline">
            Zamów usługę →
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Asystent domeny DNS/SSL</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Ostatnie sprawdzenie rekordów A/AAAA, NS, MX i certyfikatu TLS.
                </p>
              </div>
              {checklist[0] ? (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    checklist[0].status === 'OK'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : checklist[0].status === 'WARNING'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                  }`}
                >
                  {checklist[0].status}
                </span>
              ) : null}
            </div>
            {checklist[0] ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-neutral-500">
                  Sprawdzono: {checklist[0].checkedAt ? new Date(checklist[0].checkedAt).toLocaleString('pl-PL') : '—'}
                </p>
                {Array.isArray(checklist[0].issues) && checklist[0].issues.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm text-amber-100">
                    {checklist[0].issues.map((issue) => (
                      <li key={String(issue)}>{String(issue)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-emerald-200">Nie wykryto problemów DNS/SSL.</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-neutral-500">
                Brak zapisanych wyników. Kliknij „Asystent DNS/SSL”, aby uruchomić pierwsze sprawdzenie.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a0a0a]/80 p-5">
            <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
              <Server className="h-4 w-4 text-white" />
              <span>
                Powiązana usługa: <span className="text-white">{linked.planName}</span> ({linked.status})
              </span>
              <Link
                href={`/dashboard/services/${linked.id}`}
                className="ml-auto inline-flex items-center gap-1 text-indigo-400 hover:underline"
              >
                Hosting Manager
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </Link>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-white">Narzędzia hostingowe</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {toolLinks.map(({ href, label, desc, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group rounded-2xl border border-white/10 bg-black/30 p-5 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-white group-hover:text-indigo-200">{label}</p>
                      <p className="mt-1 text-xs text-neutral-500">{desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

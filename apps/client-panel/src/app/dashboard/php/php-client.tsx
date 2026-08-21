'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Check, Globe, Loader2 } from 'lucide-react';
import { Select } from '@/components/panel';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import {
  fetchDomainPhp,
  setDomainPhp,
  setPhpVersion,
  type DomainPhpStatus,
  type PhpStatus,
} from './php-actions';

export function PhpClient({ serviceId, status }: { serviceId: string; status: PhpStatus }) {
  const router = useRouter();
  const [version, setVersion] = useState(status.version ?? status.availableVersions[0] ?? '');
  const [pending, startTransition] = useTransition();

  const inflight =
    status.lastTask && (status.lastTask.status === 'QUEUED' || status.lastTask.status === 'RUNNING');

  const apply = () =>
    startTransition(async () => {
      const res = await setPhpVersion(serviceId, version);
      if (!res.ok) {
        toast.error('Nie udało się zmienić wersji PHP', { description: res.error });
        return;
      }
      toast.success(`Zlecono zmianę PHP na ${version}`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-neutral-400">Domena</p>
        <p className="font-mono text-white">{status.domain}</p>
        <p className="mt-3 text-sm text-neutral-400">Aktualna wersja PHP</p>
        <p className="text-2xl font-bold text-white">{status.version ?? 'domyślna węzła'}</p>
        {status.appliedAt ? (
          <p className="mt-1 text-xs text-neutral-500">
            Zastosowano: {new Date(status.appliedAt).toLocaleString('pl-PL')}
          </p>
        ) : null}
        <DomainPhpOverridesNote serviceId={serviceId} accountVersion={status.version} />
      </div>

      {inflight ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <Loader2 className="h-4 w-4 animate-spin" /> Zmiana wersji PHP jest w toku — odśwież za chwilę.
        </div>
      ) : null}
      {status.lastTask?.status === 'FAILED' ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          Ostatnia zmiana nie powiodła się: {status.lastTask.errorMessage ?? 'błąd'}.
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Zmień wersję PHP</p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end max-w-md">
          <label className="flex-1 space-y-1">
            <span className="text-xs text-neutral-400">Wersja</span>
            <Select
              value={version}
              onChange={setVersion}
              aria-label="Wersja PHP"
              options={status.availableVersions.map((v) => ({ value: v, label: `PHP ${v}` }))}
            />
          </label>
          <button
            type="button"
            onClick={apply}
            disabled={pending || !!inflight || version === status.version}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Zastosuj
          </button>
        </div>
        <p className="text-[11px] text-neutral-500">
          Zmiana jest wykonywana na serwerze (CloudLinux PHP Selector) — zwykle trwa kilkadziesiąt
          sekund. Skrypty i .htaccess pozostają bez zmian.
        </p>
      </div>

      <DomainPhpSection serviceId={serviceId} />
    </div>
  );
}

/** FALA-2b — wybór wersji PHP dla pojedynczej domeny (selektor DirectAdmin). */
/**
 * FALA-2b — sygnalizacja pierwszeństwa.
 *
 * Wersja ustawiona per domena wygrywa z wersją konta dla danego vhosta. Bez tej
 * informacji klient zmienia PHP dla konta, część stron zostaje na starej wersji
 * i nie ma jak się dowiedzieć dlaczego. Pokazujemy wyjątki dokładnie tam, gdzie
 * zapada decyzja — przy selektorze konta, nie w osobnej sekcji niżej.
 */
function DomainPhpOverridesNote({
  serviceId,
  accountVersion,
}: {
  serviceId: string;
  accountVersion: string | null;
}) {
  const [wyjatki, setWyjatki] = useState<{ domain: string; version: string }[]>([]);

  useEffect(() => {
    let porzucone = false;
    void fetchHostingDomainsAction(serviceId)
      .then(async (res) => {
        const statusy = await Promise.all(
          res.domains.map((d) =>
            fetchDomainPhp(serviceId, d.name).then((s) => ({ domain: d.name, status: s })),
          ),
        );
        if (porzucone) return;
        setWyjatki(
          statusy
            .filter((x) => x.status?.currentVersion && x.status.currentVersion !== accountVersion)
            .map((x) => ({ domain: x.domain, version: x.status!.currentVersion as string })),
        );
      })
      .catch(() => setWyjatki([]));
    return () => {
      porzucone = true;
    };
  }, [serviceId, accountVersion]);

  if (wyjatki.length === 0) return null;

  return (
    <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="space-y-1 text-xs">
        <p className="font-semibold text-amber-200">
          {wyjatki.length === 1
            ? 'Jedna domena ma własną wersję PHP i nie zmieni się razem z kontem'
            : `${wyjatki.length} domeny mają własną wersję PHP i nie zmienią się razem z kontem`}
        </p>
        <ul className="space-y-0.5 text-neutral-300">
          {wyjatki.map((w) => (
            <li key={w.domain} className="font-mono">
              {w.domain} → PHP {w.version}
            </li>
          ))}
        </ul>
        <p className="text-neutral-500">
          Ustawienie per domena ma pierwszeństwo. Zmień je niżej, w sekcji „PHP per domena”.
        </p>
      </div>
    </div>
  );
}

function DomainPhpSection({ serviceId }: { serviceId: string }) {
  const [domains, setDomains] = useState<string[]>([]);
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<DomainPhpStatus | null>(null);
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void fetchHostingDomainsAction(serviceId)
      .then((res) => {
        const names = res.domains.map((d) => d.name);
        setDomains(names);
        if (names.length > 0) setDomain((cur) => cur || names[0]);
      })
      .catch(() => setDomains([]))
      .finally(() => setLoading(false));
  }, [serviceId]);

  useEffect(() => {
    if (!domain) return;
    setStatus(null);
    void fetchDomainPhp(serviceId, domain).then((res) => {
      setStatus(res);
      if (res) setVersion(res.currentVersion ?? res.slotReleases[0] ?? '');
    });
  }, [serviceId, domain]);

  const apply = () =>
    startTransition(async () => {
      const res = await setDomainPhp(serviceId, domain, version);
      if (!res.ok) {
        toast.error('Nie udało się zmienić PHP domeny', { description: res.error });
        return;
      }
      toast.success(`PHP dla ${domain} → ${version}`);
      const fresh = await fetchDomainPhp(serviceId, domain);
      setStatus(fresh);
    });

  if (loading || domains.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
        <Globe className="h-4 w-4 text-emerald-400" /> PHP per domena
      </p>
      <p className="text-[11px] text-neutral-500">
        Nadpisuje wersję PHP dla wybranej domeny (pozostałe strony konta zostają przy ustawieniu
        powyżej). Zmiana działa od razu, bez zadania na serwerze.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end max-w-xl">
        <label className="flex-1 space-y-1">
          <span className="text-xs text-neutral-400">Domena</span>
          <Select
            value={domain}
            onChange={setDomain}
            aria-label="Domena"
            options={domains.map((d) => ({ value: d, label: d }))}
          />
        </label>
        <label className="flex-1 space-y-1">
          <span className="text-xs text-neutral-400">
            Wersja{status?.currentVersion ? ` (obecnie ${status.currentVersion})` : ''}
          </span>
          <Select
            value={version}
            onChange={setVersion}
            aria-label="Wersja PHP domeny"
            options={(status?.slotReleases ?? []).map((v) => ({ value: v, label: `PHP ${v}` }))}
          />
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={pending || !status || !version || version === status.currentVersion}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Zastosuj
        </button>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState, useId } from 'react';
import { AlertCircle, ExternalLink, Loader2, Plus, RefreshCw, Rocket, Trash2 } from 'lucide-react';
import { Button } from '@verris/ui';
import type { DeployFrequency, DeployJobDto } from '@verris/contracts';
import {
  createDeployJobAction,
  deleteDeployJobAction,
  fetchDeployJobsAction,
} from '@/app/dashboard/services/[id]/deploy-actions';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import { Select } from '@/components/panel';
import { GitRepoPanel } from '@/components/hosting/GitRepoPanel';

interface DeployTabProps {
  serviceId: string;
}

const FREQUENCY_LABEL: Record<DeployFrequency, string> = {
  every_15m: 'Co 15 minut',
  hourly: 'Co godzinę',
  daily: 'Raz dziennie (03:30)',
};

export default function DeployTab({ serviceId }: DeployTabProps) {
  const fieldId = useId();
  const { links } = useHostingLinks();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<DeployJobDto[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [domain, setDomain] = useState('');
  const [branch, setBranch] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [frequency, setFrequency] = useState<DeployFrequency>('every_15m');

  // Samo pobranie — przy montażu `error` jest już pusty, więc efekt nie musi go zerować.
  const fetchJobs = useCallback(
    () =>
      fetchDeployJobsAction(serviceId).then((res) => {
        if (!res) {
          setFetchError('fetch-failed');
          setRows([]);
          setLoading(false);
          return;
        }
        setRows(res.rows);
        setDomains(res.domains);
        setFetchError(res.fetchError);
        setDomain((prev) => prev || res.primaryDomain || res.domains[0] || '');
        setLoading(false);
      }),
    [serviceId],
  );

  const load = useCallback(() => {
    setError(null);
    return fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleCreate = async () => {
    if (!domain) {
      setError('Wybierz domenę, dla której skonfigurujemy wdrożenia.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createDeployJobAction(serviceId, {
      domain,
      branch: branch.trim() || undefined,
      buildCommand: buildCommand.trim() || undefined,
      frequency,
    });
    if (result.ok) {
      setBranch('');
      setBuildCommand('');
      await load();
    } else {
      setError(result.error);
    }
    setBusy(false);
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    setError(null);
    const result = await deleteDeployJobAction(serviceId, id);
    if (!result.ok) setError(result.error);
    await load();
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie wdrożeń…
      </div>
    );
  }

  return (
    <HostingTabShell
      title="Automatyczne wdrożenia (Git)"
      description="Sklonuj repozytorium do katalogu strony, pobieraj zmiany jednym kliknięciem albo według harmonogramu (git pull i opcjonalny build)."
      icon={<Rocket className="h-4 w-4" />}
      actions={
        <>
          {links.fileManagerUrl ? (
            <DaExternalLink href={links.fileManagerUrl}>
              Menedżer plików
              <ExternalLink className="h-3 w-3 opacity-70" />
            </DaExternalLink>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void load()}
            className="h-8 gap-1.5 border-line-strong bg-raised text-foreground hover:bg-raised text-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </Button>
        </>
      }
    >
      <GitRepoPanel serviceId={serviceId} domains={domains} />
      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-crit/30 bg-crit/12 px-3 py-2 text-xs text-crit">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}

      <div className="mb-5 rounded-[10px] border border-line bg-raised p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nowe wdrożenie
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${fieldId}-domain`} className="block text-xs text-muted-foreground">
            Domena
            <Select
              id={`${fieldId}-domain`}
              value={domain}
              onChange={setDomain}
              aria-label="Domena"
              className="mt-1"
              placeholder="Brak domen na koncie"
              options={domains.map((d) => ({ value: d, label: d }))}
            />
          </label>
          <label htmlFor={`${fieldId}-frequency`} className="block text-xs text-muted-foreground">
            Częstotliwość
            <Select
              id={`${fieldId}-frequency`}
              value={frequency}
              onChange={(v) => setFrequency(v as DeployFrequency)}
              aria-label="Częstotliwość"
              className="mt-1"
              options={(Object.keys(FREQUENCY_LABEL) as DeployFrequency[]).map((f) => ({
                value: f,
                label: FREQUENCY_LABEL[f],
              }))}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Gałąź Git (opcjonalnie)
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="mt-1 w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Komenda build (opcjonalnie)
            <input
              value={buildCommand}
              onChange={(e) => setBuildCommand(e.target.value)}
              placeholder="composer install --no-dev"
              className="mt-1 w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground font-mono"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          Po podłączeniu repozytorium w katalogu domeny harmonogram wykona{' '}
          <span className="font-mono text-[color:var(--verris-body)]">git pull</span>
          {branch ? <> gałęzi <span className="font-mono text-[color:var(--verris-body)]">{branch}</span></> : null}
          {buildCommand ? <> oraz <span className="font-mono text-[color:var(--verris-body)]">{buildCommand}</span></> : null}. Znaki
          specjalne powłoki w komendzie build są blokowane ze względów bezpieczeństwa.
        </p>
        <Button
          type="button"
          size="sm"
          disabled={busy || !domain}
          onClick={() => void handleCreate()}
          className="mt-3 h-9 gap-1.5 text-xs"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Zapisz wdrożenie
        </Button>
      </div>

      <div className="rounded-[10px] border border-line bg-card overflow-hidden">
        <table className="v2-stack w-full text-xs sm:text-sm">
          <thead className="bg-raised border-b border-line text-left">
            <tr>
              <th className="py-3 px-3 font-semibold">Domena</th>
              <th className="py-3 px-3 font-semibold">Harmonogram</th>
              <th className="py-3 px-3 text-right font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !fetchError ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground text-xs">
                  Brak skonfigurowanych wdrożeń — dodaj pierwsze powyżej.
                </td>
              </tr>
            ) : null}
            {rows.map((job) => (
              <tr key={job.id} className="border-b border-line hover:bg-raised align-top">
                <td data-label="Domena" className="py-3 px-3 text-foreground">
                  {job.domain}
                  {job.branch ? (
                    <span className="ml-2 rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {job.branch}
                    </span>
                  ) : null}
                </td>
                <td data-label="Harmonogram" className="py-3 px-3 text-muted-foreground">
                  {FREQUENCY_LABEL[job.frequency]}
                </td>
                <td data-label="Akcje" className="py-3 px-3 text-right">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(job.id)}
                    className="inline-flex items-center gap-1 text-xs text-crit hover:text-crit disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HostingTabShell>
  );
}

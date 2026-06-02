'use client';

import { useCallback, useEffect, useState } from 'react';
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

interface DeployTabProps {
  serviceId: string;
}

const FREQUENCY_LABEL: Record<DeployFrequency, string> = {
  every_15m: 'Co 15 minut',
  hourly: 'Co godzinę',
  daily: 'Raz dziennie (03:30)',
};

export default function DeployTab({ serviceId }: DeployTabProps) {
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

  const load = useCallback(async () => {
    setError(null);
    const res = await fetchDeployJobsAction(serviceId);
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
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie wdrożeń…
      </div>
    );
  }

  return (
    <HostingTabShell
      title="Automatyczne wdrożenia (Git)"
      description="Verris uruchamia git pull i build w katalogu Twojej domeny według harmonogramu — repozytorium podłączasz raz w menedżerze plików."
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
            className="h-8 gap-1.5 border-white/15 bg-white/[0.04] text-white hover:bg-white/10 text-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}

      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Nowe wdrożenie
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-neutral-400">
            Domena
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white"
            >
              {domains.length === 0 ? <option value="">Brak domen na koncie</option> : null}
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-neutral-400">
            Częstotliwość
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as DeployFrequency)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white"
            >
              {(Object.keys(FREQUENCY_LABEL) as DeployFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-neutral-400">
            Gałąź Git (opcjonalnie)
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-neutral-400">
            Komenda build (opcjonalnie)
            <input
              value={buildCommand}
              onChange={(e) => setBuildCommand(e.target.value)}
              placeholder="composer install --no-dev"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white font-mono"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
          Po podłączeniu repozytorium w katalogu domeny harmonogram wykona{' '}
          <span className="font-mono text-neutral-300">git pull</span>
          {branch ? <> gałęzi <span className="font-mono text-neutral-300">{branch}</span></> : null}
          {buildCommand ? <> oraz <span className="font-mono text-neutral-300">{buildCommand}</span></> : null}. Znaki
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

      <div className="rounded-xl border border-white/5 bg-[#050505] overflow-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-white/5 border-b border-white/5 text-left">
            <tr>
              <th className="py-3 px-3 text-neutral-300 font-semibold">Domena</th>
              <th className="py-3 px-3 text-neutral-300 font-semibold hidden sm:table-cell">Harmonogram</th>
              <th className="py-3 px-3 text-right text-neutral-300 font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !fetchError ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-neutral-500 text-xs">
                  Brak skonfigurowanych wdrożeń — dodaj pierwsze powyżej.
                </td>
              </tr>
            ) : null}
            {rows.map((job) => (
              <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02] align-top">
                <td className="py-3 px-3 text-white">
                  {job.domain}
                  {job.branch ? (
                    <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400">
                      {job.branch}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 px-3 text-neutral-400 hidden sm:table-cell">
                  {FREQUENCY_LABEL[job.frequency]}
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(job.id)}
                    className="inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200 disabled:opacity-50"
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

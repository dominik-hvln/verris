'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Box, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@verris/ui';
import type { HostingStagingDatabaseDto, HostingStagingEnvDto } from '@verris/contracts';
import {
  createHostingStagingAction,
  deleteHostingStagingAction,
  fetchHostingStagingAction,
} from '@/app/dashboard/services/[id]/hosting-staging-actions';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';

interface StagingTabProps {
  serviceId: string;
}

export default function StagingTab({ serviceId }: StagingTabProps) {
  const { links } = useHostingLinks();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<HostingStagingEnvDto[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [domain, setDomain] = useState('');
  const [label, setLabel] = useState('staging');
  const [withDatabase, setWithDatabase] = useState(true);
  const [createdDb, setCreatedDb] = useState<HostingStagingDatabaseDto | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetchHostingStagingAction(serviceId);
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
      setError('Wybierz domenę, pod którą utworzymy środowisko staging.');
      return;
    }
    setBusy(true);
    setError(null);
    setCreatedDb(null);
    const result = await createHostingStagingAction(serviceId, {
      domain,
      label: label.trim() || undefined,
      withDatabase,
    });
    if (result.ok) {
      setCreatedDb(result.database);
      await load();
    } else {
      setError(result.error);
    }
    setBusy(false);
  };

  const handleDelete = async (env: HostingStagingEnvDto) => {
    setBusy(true);
    setError(null);
    const result = await deleteHostingStagingAction(serviceId, {
      domain: env.domain,
      subdomain: env.subdomain,
    });
    if (!result.ok) setError(result.error);
    await load();
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie środowisk staging…
      </div>
    );
  }

  return (
    <HostingTabShell
      title="Środowisko staging"
      description="Utwórz osobną poddomenę (z własnym katalogiem i opcjonalną bazą) do testów zmian zanim trafią na produkcję."
      icon={<Box className="h-4 w-4" />}
      actions={
        <>
          {links.domainsUrl ? (
            <DaExternalLink href={links.domainsUrl}>
              Pliki w panelu
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

      {createdDb ? (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-xs text-emerald-100">
          <p className="font-semibold">Baza staging utworzona — zapisz dane teraz, nie pokażemy ich ponownie:</p>
          <dl className="mt-2 grid gap-1 font-mono">
            <div>Baza / użytkownik: <span className="text-white">{createdDb.name}</span></div>
            <div>Hasło: <span className="text-white">{createdDb.password}</span></div>
          </dl>
        </div>
      ) : null}

      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Nowe środowisko
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
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
            Nazwa poddomeny
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="staging"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={withDatabase}
            onChange={(e) => setWithDatabase(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-[#050505]"
          />
          Utwórz dedykowaną bazę MySQL dla staging
        </label>
        <p className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
          Powstanie poddomena <span className="font-mono text-neutral-300">{(label || 'staging') + '.' + (domain || 'twojadomena.pl')}</span>{' '}
          z własnym katalogiem. Pliki produkcyjne skopiujesz do niej w menedżerze plików; bazę podłączysz wg danych powyżej.
        </p>
        <Button
          type="button"
          size="sm"
          disabled={busy || !domain}
          onClick={() => void handleCreate()}
          className="mt-3 h-9 gap-1.5 text-xs"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Utwórz staging
        </Button>
      </div>

      <div className="rounded-xl border border-white/5 bg-[#050505] overflow-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-white/5 border-b border-white/5 text-left">
            <tr>
              <th className="py-3 px-3 text-neutral-300 font-semibold">Środowisko</th>
              <th className="py-3 px-3 text-right text-neutral-300 font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !fetchError ? (
              <tr>
                <td colSpan={2} className="px-3 py-8 text-center text-neutral-500 text-xs">
                  Brak środowisk staging — utwórz pierwsze powyżej.
                </td>
              </tr>
            ) : null}
            {rows.map((env) => (
              <tr key={env.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 px-3 text-white">
                  <a
                    href={env.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 hover:text-indigo-300"
                  >
                    {env.id}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(env)}
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

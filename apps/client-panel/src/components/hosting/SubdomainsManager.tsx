'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import {
  createHostingSubdomainAction,
  deleteHostingSubdomainAction,
  fetchHostingSubdomainsAction,
  type SubdomainRow,
} from '@/app/dashboard/services/[id]/hosting-extra-actions';
import { Select } from '@/components/panel';
import { daErrorMessage, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { HostingHelpHint } from '@/components/hosting/HostingTabShell';

export default function SubdomainsManager({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<SubdomainRow[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    void fetchHostingSubdomainsAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setDomains(res.domains);
        setDomain((cur) => cur || res.domains[0] || '');
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać poddomen.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) return toast.error('Brak domeny na koncie.');
    setCreating(true);
    const res = await createHostingSubdomainAction(serviceId, { domain, subdomain: label.trim() });
    setCreating(false);
    if (!res.ok)
      return toast.error('Nie udało się utworzyć poddomeny', { description: daErrorMessage(res.error) });
    toast.success('Poddomena utworzona', { description: `${label.trim()}.${domain}` });
    setLabel('');
    load();
  };

  const onDelete = async (row: SubdomainRow) => {
    if (!window.confirm(`Usunąć poddomenę „${row.subdomain}.${row.domain}" wraz z zawartością?`)) return;
    setDeleting(row.id);
    const res = await deleteHostingSubdomainAction(serviceId, {
      domain: row.domain,
      subdomain: row.subdomain,
    });
    setDeleting(null);
    if (!res.ok) return toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) });
    toast.success('Poddomena usunięta');
    load();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <HostingHelpHint
        help={{
          blurb:
            'Poddomena (np. sklep.twojadomena.pl) to osobny adres z własnym katalogiem na pliki. Dodanie jest bezpieczne; pamiętaj o certyfikacie SSL dla HTTPS.',
          kbQuery: 'poddomeny',
        }}
      />
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-violet-300" />
        <h3 className="text-sm font-semibold text-white">Poddomeny</h3>
      </div>

      <form onSubmit={onCreate} className="mb-4 flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-xs text-neutral-400">Nazwa</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="np. sklep"
            className="w-40 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
        <span className="pb-2 text-sm text-neutral-500">.</span>
        <label className="space-y-1">
          <span className="text-xs text-neutral-400">Domena</span>
          <Select
            value={domain}
            onChange={setDomain}
            disabled={domains.length === 0}
            aria-label="Domena"
            className="min-w-[10rem]"
            placeholder="—"
            options={domains.map((d) => ({ value: d, label: d }))}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          disabled={creating || !label.trim() || !domain}
          className="h-9 gap-1.5 bg-white text-black hover:bg-neutral-200 text-xs"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Dodaj
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : error ? (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200/90">
          {hostingFetchErrorMessage(error)}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-neutral-500">Brak poddomen.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-[#050505]">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 last:border-0"
            >
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-sm text-white hover:text-violet-300"
              >
                {r.subdomain}.{r.domain}
              </a>
              <button
                type="button"
                title="Usuń poddomenę"
                disabled={deleting === r.id}
                onClick={() => void onDelete(r)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {deleting === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

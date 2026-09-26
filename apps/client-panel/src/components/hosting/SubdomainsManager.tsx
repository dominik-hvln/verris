'use client';

import { useEffect, useState, useId } from 'react';
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
import { potwierdz } from '@/components/panel/potwierdz';

export default function SubdomainsManager({ serviceId }: { serviceId: string }) {
  const domainId = useId();
  const [rows, setRows] = useState<SubdomainRow[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Samo pobranie — efekt montażu startuje z `loading` już ustawionym na `true`.
  const fetchRows = () =>
    fetchHostingSubdomainsAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setDomains(res.domains);
        setDomain((cur) => cur || res.domains[0] || '');
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać poddomen.'))
      .finally(() => setLoading(false));

  const load = () => {
    setLoading(true);
    void fetchRows();
  };

  useEffect(() => {
    void fetchRows();
  }, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!(await potwierdz(`Usunąć poddomenę „${row.subdomain}.${row.domain}" wraz z zawartością?`, { akcja: 'Usuń', niebezpieczne: true }))) return;
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
    <div className="rounded-[10px] border border-line bg-raised p-5">
      <HostingHelpHint
        help={{
          blurb:
            'Poddomena (np. sklep.twojadomena.pl) to osobny adres z własnym katalogiem na pliki. Dodanie jest bezpieczne; pamiętaj o certyfikacie SSL dla HTTPS.',
          kbQuery: 'poddomeny',
        }}
      />
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-data-hi" />
        <h3 className="text-sm font-semibold text-foreground">Poddomeny</h3>
      </div>

      <form onSubmit={onCreate} className="mb-4 flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Nazwa</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="np. sklep"
            className="w-40 rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
          />
        </label>
        <span className="pb-2 text-sm text-muted-foreground">.</span>
        <label htmlFor={domainId} className="space-y-1">
          <span className="text-xs text-muted-foreground">Domena</span>
          <Select
            id={domainId}
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
          className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Dodaj
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : error ? (
        <p className="rounded-[7px] border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
          {hostingFetchErrorMessage(error)}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Brak poddomen.</p>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line bg-card">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0"
            >
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="break-words font-mono text-sm text-foreground hover:text-data-hi"
              >
                {r.subdomain}.{r.domain}
              </a>
              <button
                type="button"
                title="Usuń poddomenę"
                disabled={deleting === r.id}
                onClick={() => void onDelete(r)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-crit hover:bg-crit/12 disabled:opacity-50"
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

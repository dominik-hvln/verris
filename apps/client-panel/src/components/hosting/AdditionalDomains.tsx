'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe, Link2, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import {
  fetchAdditionalDomainsAction,
  createAdditionalDomainAction,
  deleteAdditionalDomainAction,
  fetchDomainPointersAction,
  createDomainPointerAction,
  deleteDomainPointerAction,
  type AdditionalDomainRow,
  type DomainPointerRow,
} from '@/app/dashboard/services/[id]/hosting-additional-domains-actions';
import { daErrorMessage } from '@/lib/client-hosting-messages';

export default function AdditionalDomains({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<AdditionalDomainRow[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  // aliasy (pointers)
  const [aliases, setAliases] = useState<DomainPointerRow[]>([]);
  const [alias, setAlias] = useState('');
  const [aBusy, setABusy] = useState(false);
  const [aDel, setADel] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, ptr] = await Promise.all([
        fetchAdditionalDomainsAction(serviceId),
        fetchDomainPointersAction(serviceId).catch(() => ({ rows: [], primary: null, fetchError: null })),
      ]);
      setRows(res.rows);
      setFetchError(res.fetchError);
      setAliases(ptr.rows);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Nie udało się pobrać domen.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);
  useEffect(() => { void load(); }, [load]);

  const addAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias.trim()) { toast.error('Podaj nazwę aliasu domeny.'); return; }
    setABusy(true);
    const res = await createDomainPointerAction({ subscriptionId: serviceId, alias: alias.trim() });
    setABusy(false);
    if (!res.ok) { toast.error('Nie udało się dodać aliasu', { description: daErrorMessage(res.error) }); return; }
    toast.success('Alias domeny dodany'); setAlias(''); void load();
  };
  const removeAlias = async (a: string) => {
    if (!window.confirm(`Usunąć alias „${a}"?`)) return;
    setADel(a);
    const res = await deleteDomainPointerAction(serviceId, a);
    setADel(null);
    if (!res.ok) { toast.error('Nie udało się usunąć aliasu', { description: daErrorMessage(res.error) }); return; }
    toast.success('Alias usunięty'); void load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) { toast.error('Podaj nazwę domeny.'); return; }
    setBusy(true);
    const res = await createAdditionalDomainAction({ subscriptionId: serviceId, domain: domain.trim() });
    setBusy(false);
    if (!res.ok) { toast.error('Nie udało się dodać domeny', { description: daErrorMessage(res.error) }); return; }
    toast.success('Domena dodana do konta'); setDomain(''); void load();
  };
  const remove = async (d: string) => {
    if (!window.confirm(`Usunąć domenę „${d}" z konta? Pliki tej domeny mogą zostać usunięte.`)) return;
    setDel(d);
    const res = await deleteAdditionalDomainAction(serviceId, d);
    setDel(null);
    if (!res.ok) { toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) }); return; }
    toast.success('Domena usunięta'); void load();
  };

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Globe className="h-4 w-4 text-emerald-300" /> Domeny dodatkowe na koncie</h3>
      <p className="mt-1 text-xs text-neutral-400">Hostuj kilka osobnych domen w ramach jednej usługi — każda z własnym katalogiem i pocztą.</p>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="np. drugadomena.pl" className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500" />
        <Button type="submit" disabled={busy} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Dodaj domenę</Button>
      </form>
      {loading ? (
        <p className="mt-3 text-xs text-neutral-500"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Wczytywanie…</p>
      ) : fetchError ? (
        <p className="mt-3 text-xs text-amber-300/80">{fetchError}</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-500">Brak domen na koncie.</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div key={r.domain} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-white">
                {r.domain}
                {r.isPrimary && <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300"><Star className="h-3 w-3" /> główna</span>}
              </span>
              {!r.isPrimary && (
                <button onClick={() => remove(r.domain)} disabled={del === r.domain} className="shrink-0 text-neutral-500 hover:text-rose-300" title="Usuń domenę">
                  {del === r.domain ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white"><Link2 className="h-4 w-4 text-emerald-300" /> Aliasy domeny (wskazują na stronę główną)</h4>
        <p className="mt-1 text-xs text-neutral-400">Alias (domena zaparkowana) pokazuje tę samą stronę co domena główna — np. wariant .com obok .pl.</p>
        <form onSubmit={addAlias} className="mt-3 flex gap-2">
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="np. twojafirma.com" className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500" />
          <Button type="submit" disabled={aBusy} className="h-9 gap-1.5 bg-white/10 text-white hover:bg-white/20 text-xs">{aBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Dodaj alias</Button>
        </form>
        {aliases.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {aliases.map((a) => (
              <div key={a.alias} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <span className="font-medium text-white">{a.alias}</span>
                <button onClick={() => removeAlias(a.alias)} disabled={aDel === a.alias} className="shrink-0 text-neutral-500 hover:text-rose-300" title="Usuń alias">
                  {aDel === a.alias ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

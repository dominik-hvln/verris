'use client';

import { useState } from 'react';
import { Globe2, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDbAccessHostsAction,
  addDbAccessHostAction,
  removeDbAccessHostAction,
} from '@/app/dashboard/services/[id]/hosting-db-access-actions';
import { daErrorMessage } from '@/lib/client-hosting-messages';

/** PANEL-10 — zarządzanie zdalnym dostępem do bazy (MySQL access hosts). */
export default function DbAccessHosts({ serviceId, db }: { serviceId: string; db: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hosts, setHosts] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const res = await fetchDbAccessHostsAction(serviceId, db).catch((e) => ({ hosts: [], fetchError: e instanceof Error ? e.message : 'Błąd' }));
    setHosts(res.hosts); setErr(res.fetchError); setLoading(false); setLoaded(true);
  };
  const toggle = () => { const n = !open; setOpen(n); if (n && !loaded) void load(); };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) { toast.error('Podaj host (IP, nazwę lub % dla wszystkich).'); return; }
    setBusy(true);
    const res = await addDbAccessHostAction({ subscriptionId: serviceId, db, host: host.trim() });
    setBusy(false);
    if (!res.ok) { toast.error('Nie udało się dodać hosta', { description: daErrorMessage(res.error) }); return; }
    toast.success('Host dostępu dodany'); setHost(''); void load();
  };
  const remove = async (h: string) => {
    setDel(h);
    const res = await removeDbAccessHostAction({ subscriptionId: serviceId, db, host: h });
    setDel(null);
    if (!res.ok) { toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) }); return; }
    toast.success('Host usunięty'); void load();
  };

  return (
    <div className="mt-1">
      <button onClick={toggle} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-data-hi">
        <Globe2 className="h-3 w-3" /> {open ? 'Ukryj zdalny dostęp' : 'Zdalny dostęp (MySQL)'}
      </button>
      {open && (
        <div className="mt-2 rounded-[7px] border border-line bg-background p-3">
          <p className="mb-2 text-[11px] text-muted-foreground">Zezwól na połączenia z bazą spoza serwera (np. z aplikacji). Użyj <code>%</code> dla wszystkich adresów lub podaj konkretne IP.</p>
          <form onSubmit={add} className="flex gap-2">
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="np. 203.0.113.5 lub %" className="flex-1 rounded-[7px] border border-line bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground" />
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-[7px] bg-primary text-primary-foreground font-semibold px-2.5 py-1.5 text-xs hover:bg-data-hi disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Dodaj
            </button>
          </form>
          {loading ? (
            <p className="mt-2 text-[11px] text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> Wczytywanie…</p>
          ) : err ? (
            <p className="mt-2 text-[11px] text-warn">{err}</p>
          ) : hosts.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Brak dodatkowych hostów — baza dostępna tylko lokalnie.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hosts.map((h) => (
                <span key={h} className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-background px-2 py-1 text-xs text-foreground">
                  <span className="font-mono">{h}</span>
                  <button onClick={() => remove(h)} disabled={del === h} className="text-muted-foreground hover:text-crit">
                    {del === h ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

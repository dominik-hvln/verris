'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { HostingDnsRecordDto } from '@verris/contracts';
import { AlertCircle, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Select } from '@/components/panel';
import { createDnsRecordAction, deleteDnsRecordAction, editDnsRecordAction } from './dns-actions';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'CAA'] as const;
type RecType = (typeof TYPES)[number];

const NEEDS_PRIORITY = (t: string) => t === 'MX' || t === 'SRV';

const PLACEHOLDER: Record<RecType, string> = {
  A: '192.0.2.10',
  AAAA: '2001:db8::1',
  CNAME: 'cel.przyklad.pl.',
  MX: 'mail.przyklad.pl.',
  TXT: 'v=spf1 include:_spf.verris.pl ~all',
  SRV: 'weight port target (np. 1 443 sip.przyklad.pl.)',
  NS: 'ns1.przyklad.pl.',
  CAA: '0 issue "letsencrypt.org"',
};

/**
 * Full DNS zone manager: add / edit / delete records of all common types.
 * Backend create+delete go through DirectAdmin CMD_API_DNS_CONTROL; edit is a
 * safe create-then-delete. MX/SRV compose "<priority> <value>".
 */
export function DnsManager({
  serviceId,
  domain,
  records,
}: {
  serviceId: string;
  domain: string | null;
  records: HostingDnsRecordDto[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  // PANEL-7 — szybkie presety DNS (zestawy rekordów jednym kliknięciem).
  const dnsPresets = (d: string): { id: string; label: string; desc: string; records: { name: string; type: string; value: string }[] }[] => {
    const tenant = d.replace(/\./g, '-');
    return [
      { id: 'google', label: 'Poczta Google Workspace', desc: '5 rekordów MX Google', records: [
        { name: '@', type: 'MX', value: '1 ASPMX.L.GOOGLE.COM.' },
        { name: '@', type: 'MX', value: '5 ALT1.ASPMX.L.GOOGLE.COM.' },
        { name: '@', type: 'MX', value: '5 ALT2.ASPMX.L.GOOGLE.COM.' },
        { name: '@', type: 'MX', value: '10 ALT3.ASPMX.L.GOOGLE.COM.' },
        { name: '@', type: 'MX', value: '10 ALT4.ASPMX.L.GOOGLE.COM.' },
      ] },
      { id: 'm365', label: 'Poczta Microsoft 365', desc: 'MX + autodiscover', records: [
        { name: '@', type: 'MX', value: `0 ${tenant}.mail.protection.outlook.com.` },
        { name: 'autodiscover', type: 'CNAME', value: 'autodiscover.outlook.com.' },
      ] },
      { id: 'spf', label: 'SPF (poczta Verris)', desc: 'Rekord TXT SPF', records: [
        { name: '@', type: 'TXT', value: 'v=spf1 include:_spf.verris.pl ~all' },
      ] },
      { id: 'dmarc', label: 'DMARC (ochrona poczty)', desc: 'Rekord _dmarc TXT', records: [
        { name: '_dmarc', type: 'TXT', value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${d}` },
      ] },
    ];
  };
  const applyPreset = (preset: { label: string; records: { name: string; type: string; value: string }[] }) => {
    if (!domain) return;
    if (!window.confirm(`Dodać zestaw „${preset.label}" (${preset.records.length} rekord(ów)) do strefy ${domain}?`)) return;
    setError(null);
    startTransition(async () => {
      let ok = 0;
      for (const r of preset.records) {
        const res = await createDnsRecordAction({ serviceId, domain, name: r.name, type: r.type, value: r.value, ttl: 3600 });
        if (res.ok) ok++; else setError(res.error);
      }
      toast.success(`Dodano ${ok}/${preset.records.length} rekord(ów) z presetu „${preset.label}".`);
      refresh();
    });
  };

  const onDelete = (r: HostingDnsRecordDto) => {
    if (!domain) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteDnsRecordAction({
        serviceId,
        domain,
        name: r.name,
        type: r.type,
        value: r.value,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error('Nie udało się usunąć rekordu', { description: res.error });
      } else {
        toast.success(`Usunięto rekord ${r.type} ${r.name}`);
        refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {records.length} rekord(ów) w strefie <span className="font-mono text-neutral-300">{domain ?? '—'}</span>
        </p>
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            disabled={!domain}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Dodaj rekord
          </button>
        ) : null}
      </div>

      {domain ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">Szybkie zestawy rekordów</p>
          <div className="flex flex-wrap gap-2">
            {dnsPresets(domain).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                disabled={pending}
                title={p.desc}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-neutral-200 hover:border-emerald-400/40 hover:text-white disabled:opacity-50"
              >
                <Plus className="h-3 w-3 text-emerald-300" /> {p.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">Dodaje gotowe rekordy (np. pocztę Google/Microsoft, SPF, DMARC) jednym kliknięciem. Zawsze możesz je potem edytować lub usunąć.</p>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      ) : null}

      {adding && domain ? (
        <RecordForm
          domain={domain}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSubmit={(rec) =>
            startTransition(async () => {
              setError(null);
              const res = await createDnsRecordAction({ serviceId, domain, ...rec });
              if (!res.ok) {
                setError(res.error);
                toast.error('Nie udało się dodać rekordu', { description: res.error });
              } else {
                toast.success(`Dodano rekord ${rec.type}`);
                setAdding(false);
                refresh();
              }
            })
          }
        />
      ) : null}

      <div className="space-y-2">
        {records.length === 0 && !adding ? (
          <p className="text-sm text-neutral-400">Brak rekordów — dodaj pierwszy.</p>
        ) : null}
        {records.map((r) =>
          editingId === r.id && domain ? (
            <RecordForm
              key={r.id}
              domain={domain}
              initial={r}
              pending={pending}
              onCancel={() => setEditingId(null)}
              onSubmit={(rec) =>
                startTransition(async () => {
                  setError(null);
                  const res = await editDnsRecordAction({
                    serviceId,
                    domain,
                    old: { name: r.name, type: r.type, value: r.value },
                    next: rec,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    toast.error('Nie udało się zapisać zmian', { description: res.error });
                  } else {
                    toast.success('Zapisano zmiany rekordu');
                    setEditingId(null);
                    refresh();
                  }
                })
              }
            />
          ) : (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="min-w-0 grid grid-cols-[auto_1fr] gap-x-3 items-center">
                <span className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] font-bold text-neutral-200">
                  {r.type}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-sm text-white truncate">{r.name}</p>
                  <p className="font-mono text-xs text-neutral-400 break-all">
                    {r.value}
                    {r.ttl ? <span className="text-neutral-600"> · TTL {r.ttl}</span> : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(r.id);
                    setAdding(false);
                  }}
                  className="p-2 rounded-lg border border-white/10 hover:bg-white/5"
                  title="Edytuj"
                >
                  <Pencil className="h-3.5 w-3.5 text-neutral-300" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r)}
                  disabled={pending}
                  className="p-2 rounded-lg border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/40 disabled:opacity-50"
                  title="Usuń"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function splitPriority(type: string, value: string): { priority: string; rest: string } {
  if (NEEDS_PRIORITY(type)) {
    const m = value.match(/^\s*(\d+)\s+(.*)$/);
    if (m) return { priority: m[1], rest: m[2] };
  }
  return { priority: '10', rest: value };
}

function RecordForm({
  domain,
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  domain: string;
  initial?: HostingDnsRecordDto;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (rec: { name: string; type: string; value: string; ttl?: number }) => void;
}) {
  const init = initial ? splitPriority(initial.type, initial.value) : { priority: '10', rest: '' };
  const [type, setType] = useState<string>(initial?.type ?? 'A');
  const [name, setName] = useState(initial?.name ?? '');
  const [value, setValue] = useState(init.rest);
  const [priority, setPriority] = useState(init.priority);
  const [ttl, setTtl] = useState(initial?.ttl ? String(initial.ttl) : '3600');

  const submit = () => {
    const composed = NEEDS_PRIORITY(type) ? `${priority.trim()} ${value.trim()}` : value.trim();
    onSubmit({
      name: name.trim() || '@',
      type,
      value: composed,
      ttl: Number.parseInt(ttl, 10) || undefined,
    });
  };

  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.04] p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-3">
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-neutral-400">Typ</span>
          <Select
            value={type}
            onChange={setType}
            aria-label="Typ rekordu DNS"
            options={TYPES.map((t) => ({ value: t, label: t }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-neutral-400">Host (puste = @ dla domeny głównej)</span>
          <div className="flex items-center rounded-lg bg-black/40 border border-white/10">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. www, mail, @"
              className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none"
            />
            <span className="px-2 text-xs text-neutral-500 truncate max-w-[45%]">.{domain}</span>
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_90px] gap-3">
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-neutral-400">Wartość</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={PLACEHOLDER[type as RecType] ?? ''}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm font-mono text-white outline-none focus:border-emerald-400/60"
          />
        </label>
        {NEEDS_PRIORITY(type) ? (
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-neutral-400">Priorytet</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </label>
        ) : (
          <span className="hidden sm:block" />
        )}
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-neutral-400">TTL</span>
          <input
            type="number"
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {initial ? 'Zapisz zmiany' : 'Dodaj rekord'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5"
        >
          <X className="h-4 w-4" /> Anuluj
        </button>
      </div>
    </div>
  );
}

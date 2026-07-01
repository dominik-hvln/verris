'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  BarChart3,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  Globe,
  Eye,
  Users,
  AlertCircle,
  Power,
} from 'lucide-react';
import {
  type AnalyticsSite,
  type AnalyticsStats,
  fetchSites,
  createSite,
  setSiteEnabled,
  deleteSite,
  fetchStats,
} from './actions';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.verris.pl';
const RANGES = [
  { days: 7, label: '7 dni' },
  { days: 30, label: '30 dni' },
  { days: 90, label: '90 dni' },
];

export function AnalyticsClient({
  services,
}: {
  services: Array<{ id: string; name: string; domain: string | null }>;
}) {
  const [subId, setSubId] = useState(services[0]?.id ?? '');
  const [sites, setSites] = useState<AnalyticsSite[]>([]);
  const [activeSite, setActiveSite] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async (sub: string) => {
    if (!sub) return;
    setLoading(true);
    const r = await fetchSites(sub);
    if (r.ok) {
      setSites(r.data);
      setActiveSite((prev) => prev ?? r.data[0]?.id ?? null);
    } else flash('err', r.error);
    setLoading(false);
  };

  useEffect(() => {
    if (subId) void load(subId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subId]);

  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-cyan-300/70" />
        <h2 className="mt-4 text-lg font-semibold text-white">Brak aktywnych usług hostingowych</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
          Analityka jest dostępna dla stron WWW. Uruchom usługę hostingową, aby zacząć śledzić ruch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {services.length > 1 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Usługa</label>
          <select
            value={subId}
            onChange={(e) => {
              setActiveSite(null);
              setSubId(e.target.value);
            }}
            className="an-inp max-w-md"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id} className="bg-neutral-900">
                {s.name}
                {s.domain ? ` — ${s.domain}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
            notice.kind === 'ok'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
          }`}
        >
          {notice.kind === 'ok' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {notice.text}
        </div>
      )}

      <AddSiteForm
        subId={subId}
        suggestedDomain={services.find((s) => s.id === subId)?.domain ?? ''}
        onAdded={async () => {
          await load(subId);
          flash('ok', 'Property dodane. Wklej snippet na stronę.');
        }}
        flash={flash}
      />

      {loading ? (
        <p className="text-sm text-neutral-400">Ładowanie…</p>
      ) : sites.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-sm text-neutral-400">
          Brak property. Dodaj domenę powyżej, aby zacząć zbierać statystyki.
        </p>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              subId={subId}
              site={site}
              open={activeSite === site.id}
              onToggle={() => setActiveSite(activeSite === site.id ? null : site.id)}
              onChanged={() => load(subId)}
              flash={flash}
            />
          ))}
        </div>
      )}
      <style jsx>{`
        :global(.an-inp){width:100%;border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);padding:.5rem .7rem;font-size:.875rem;color:#fff;outline:none}
      `}</style>
    </div>
  );
}

function AddSiteForm({
  subId,
  suggestedDomain,
  onAdded,
  flash,
}: {
  subId: string;
  suggestedDomain: string;
  onAdded: () => Promise<void>;
  flash: (k: 'ok' | 'err', t: string) => void;
}) {
  const [domain, setDomain] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => setDomain(suggestedDomain ?? ''), [suggestedDomain]);

  const submit = () => {
    if (!domain.trim()) return;
    start(async () => {
      const r = await createSite(subId, domain.trim());
      if (r.ok) { setDomain(''); await onAdded(); } else flash('err', r.error);
    });
  };
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Plus className="h-4 w-4 text-cyan-300" /> Nowe property
      </h2>
      <div className="flex flex-wrap gap-2">
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.pl" className="an-inp2 flex-1 min-w-[220px]" />
        <button onClick={submit} disabled={pending} className="an-btn">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Dodaj
        </button>
      </div>
      <style jsx>{`
        :global(.an-inp2){border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);padding:.5rem .7rem;font-size:.875rem;color:#fff;outline:none}
        :global(.an-btn){display:inline-flex;align-items:center;gap:.5rem;border-radius:.7rem;background:#0891b2;padding:.5rem .9rem;font-size:.85rem;font-weight:600;color:#fff}
        :global(.an-btn:disabled){opacity:.5}
      `}</style>
    </section>
  );
}

function SiteCard({
  subId,
  site,
  open,
  onToggle,
  onChanged,
  flash,
}: {
  subId: string;
  site: AnalyticsSite;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
  flash: (k: 'ok' | 'err', t: string) => void;
}) {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const snippet = `<script defer src="${API_URL}/analytics/a.js" data-site="${site.siteKey}"></script>`;

  const loadStats = async (d: number) => {
    setLoading(true);
    const r = await fetchStats(subId, site.id, d);
    if (r.ok) setStats(r.data);
    setLoading(false);
  };
  useEffect(() => {
    if (open) void loadStats(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, days]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      flash('err', 'Nie udało się skopiować.');
    }
  };
  const toggleEnabled = () => {
    start(async () => {
      const r = await setSiteEnabled(subId, site.id, !site.enabled);
      if (r.ok) await onChanged(); else flash('err', r.error);
    });
  };
  const remove = () => {
    start(async () => {
      const r = await deleteSite(subId, site.id);
      if (r.ok) { flash('ok', 'Property usunięte.'); await onChanged(); } else flash('err', r.error);
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3 p-4">
        <button onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
          <Globe className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-semibold text-white">{site.domain}</span>
          {!site.enabled && <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] text-neutral-400">wyłączone</span>}
        </button>
        <button onClick={toggleEnabled} disabled={pending} title={site.enabled ? 'Wyłącz zbieranie' : 'Włącz zbieranie'} className="rounded-lg border border-white/10 p-2 text-neutral-300 hover:bg-white/5">
          <Power className={`h-4 w-4 ${site.enabled ? 'text-emerald-300' : 'text-neutral-500'}`} />
        </button>
        <button onClick={remove} disabled={pending} className="rounded-lg border border-rose-400/30 p-2 text-rose-300 hover:bg-rose-400/10">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-300">Snippet — wklej tuż przed &lt;/head&gt; na swojej stronie:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/50 px-3 py-2 text-[11px] text-cyan-200">{snippet}</code>
              <button onClick={copy} className="shrink-0 rounded-lg border border-white/10 px-2.5 py-2 text-neutral-300 hover:bg-white/5">
                {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1 w-fit">
            {RANGES.map((r) => (
              <button key={r.days} onClick={() => setDays(r.days)} className={`rounded-lg px-3 py-1 text-xs font-medium transition ${days === r.days ? 'bg-cyan-600 text-white' : 'text-neutral-400 hover:text-white'}`}>
                {r.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-xs text-neutral-400">Ładowanie statystyk…</p>
          ) : stats ? (
            <StatsView stats={stats} />
          ) : (
            <p className="text-xs text-neutral-500">Brak danych.</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatsView({ stats }: { stats: AnalyticsStats }) {
  const max = Math.max(1, ...stats.timeseries.map((d) => d.pageviews));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric icon={<Eye className="h-4 w-4" />} label="Odsłony" value={stats.totals.pageviews} />
        <Metric icon={<Users className="h-4 w-4" />} label="Unikalni odwiedzający" value={stats.totals.visitors} />
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="mb-3 text-xs font-medium text-neutral-300">Odsłony w czasie</p>
        <div className="flex h-32 items-end gap-[2px]">
          {stats.timeseries.map((d) => (
            <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.pageviews} odsłon, ${d.visitors} unikalnych`}>
              <div className="w-full rounded-t bg-cyan-500/70 transition group-hover:bg-cyan-400" style={{ height: `${Math.max(2, (d.pageviews / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RankList title="Najczęstsze strony" rows={stats.topPages.map((p) => ({ label: p.path, count: p.count }))} />
        <RankList title="Źródła ruchu" rows={stats.topReferrers.map((r) => ({ label: r.refHost, count: r.count }))} empty="Ruch bezpośredni" />
        <RankList title="Kraje" rows={stats.countries.map((c) => ({ label: c.country, count: c.count }))} />
        <RankList title="Urządzenia" rows={stats.devices.map((d) => ({ label: deviceLabel(d.deviceType), count: d.count }))} />
      </div>
    </div>
  );
}

function deviceLabel(d: string): string {
  return d === 'mobile' ? 'Mobilne' : d === 'tablet' ? 'Tablet' : d === 'desktop' ? 'Desktop' : d;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="text-cyan-300">{icon}</span>
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-bold text-white">{value.toLocaleString('pl-PL')}</p>
    </div>
  );
}

function RankList({ title, rows, empty }: { title: string; rows: Array<{ label: string; count: number }>; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="mb-3 text-xs font-medium text-neutral-300">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-500">{empty ?? 'Brak danych.'}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="relative overflow-hidden rounded-md">
              <div className="absolute inset-y-0 left-0 rounded-md bg-cyan-500/15" style={{ width: `${(r.count / max) * 100}%` }} />
              <div className="relative flex items-center justify-between px-2 py-1 text-xs">
                <span className="truncate text-neutral-200">{r.label || '—'}</span>
                <span className="ml-2 shrink-0 font-medium text-neutral-400">{r.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

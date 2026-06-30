'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, ImageOff, Loader2, Lock, Plus, ShieldBan, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
import {
  fetchWebToolsAction,
  saveWebToolsAction,
  setDirProtectionAction,
  removeDirProtectionAction,
  type WebToolsState,
  type Redirect,
} from '@/app/dashboard/services/[id]/hosting-webtools-actions';
import { daErrorMessage } from '@/lib/client-hosting-messages';

const field = 'rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500';
const EMPTY: WebToolsState = { redirects: [], hotlink: { enabled: false, extensions: 'jpg,jpeg,png,gif,webp,svg', allow: [] }, blockedIps: [], protectedDirs: [], forceHttps: false, wwwMode: 'none' };

export default function WebToolsTab({ serviceId }: { serviceId: string }) {
  const [state, setState] = useState<WebToolsState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // formularze
  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState('');
  const [rType, setRType] = useState<'301' | '302'>('301');
  const [ip, setIp] = useState('');
  // ochrona katalogu
  const [pDir, setPDir] = useState('');
  const [pUser, setPUser] = useState('');
  const [pPass, setPPass] = useState('');
  const [pBusy, setPBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchWebToolsAction(serviceId);
      setState({ ...EMPTY, ...res.state, hotlink: { ...EMPTY.hotlink, ...res.state.hotlink } });
      setFetchError(res.fetchError);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Nie udało się pobrać ustawień.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);
  useEffect(() => { void load(); }, [load]);

  const persist = async (next: WebToolsState, okMsg: string) => {
    setSaving(true);
    const res = await saveWebToolsAction(serviceId, next);
    setSaving(false);
    if (!res.ok) { toast.error('Nie udało się zapisać', { description: daErrorMessage(res.error) }); return false; }
    setState(next);
    toast.success(okMsg);
    return true;
  };

  const addRedirect = async () => {
    if (!rFrom.trim() || !rTo.trim()) { toast.error('Podaj ścieżkę źródłową i cel.'); return; }
    const from = rFrom.trim().startsWith('/') ? rFrom.trim() : `/${rFrom.trim()}`;
    const next = { ...state, redirects: [...state.redirects, { from, to: rTo.trim(), type: rType } as Redirect] };
    if (await persist(next, 'Przekierowanie dodane')) { setRFrom(''); setRTo(''); }
  };
  const delRedirect = async (i: number) => {
    await persist({ ...state, redirects: state.redirects.filter((_, j) => j !== i) }, 'Przekierowanie usunięte');
  };
  const toggleHotlink = async () => {
    await persist({ ...state, hotlink: { ...state.hotlink, enabled: !state.hotlink.enabled } }, state.hotlink.enabled ? 'Antyhotlink wyłączony' : 'Antyhotlink włączony');
  };
  const saveHotlinkExt = async (ext: string) => setState((s) => ({ ...s, hotlink: { ...s.hotlink, extensions: ext } }));
  const addIp = async () => {
    if (!ip.trim()) return;
    const next = { ...state, blockedIps: Array.from(new Set([...state.blockedIps, ip.trim()])) };
    if (await persist(next, 'IP zablokowane')) setIp('');
  };
  const delIp = async (v: string) => persist({ ...state, blockedIps: state.blockedIps.filter((x) => x !== v) }, 'IP odblokowane');

  const protect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pUser.trim() || pPass.length < 6) { toast.error('Podaj użytkownika i hasło (min. 6 znaków).'); return; }
    setPBusy(true);
    const res = await setDirProtectionAction({ subscriptionId: serviceId, dir: pDir.trim() || '/', user: pUser.trim(), password: pPass });
    setPBusy(false);
    if (!res.ok) { toast.error('Nie udało się ustawić ochrony', { description: daErrorMessage(res.error) }); return; }
    toast.success('Katalog zabezpieczony hasłem'); setPUser(''); setPPass(''); void load();
  };
  const unprotect = async (dir: string) => {
    if (!window.confirm(`Zdjąć ochronę z „${dir}"?`)) return;
    const res = await removeDirProtectionAction(serviceId, dir === '/' ? '' : dir);
    if (!res.ok) { toast.error('Nie udało się zdjąć ochrony', { description: daErrorMessage(res.error) }); return; }
    toast.success('Ochrona zdjęta'); void load();
  };

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /> Wczytywanie narzędzi…</div>;
  }

  return (
    <HostingTabShell
      title="Narzędzia WWW"
      description="Przekierowania, ochrona katalogów hasłem, ochrona przed hotlinkingiem i blokowanie adresów IP — zapisywane wprost do pliku .htaccess Twojej strony."
    >
      {fetchError && <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{fetchError}</p>}

      {/* HTTPS i kanonizacja domeny */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Lock className="h-4 w-4 text-emerald-300" /> HTTPS i kanonizacja domeny</h3>
        <p className="mt-1 text-xs text-neutral-400">Wymuś bezpieczne połączenie i jedną wersję adresu (z www lub bez) — lepsze SEO i brak duplikatów treści.</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={Boolean(state.forceHttps)} onChange={(e) => persist({ ...state, forceHttps: e.target.checked }, e.target.checked ? 'Wymuszanie HTTPS włączone' : 'Wymuszanie HTTPS wyłączone')} disabled={saving} className="h-4 w-4 accent-emerald-500" />
            Wymuś HTTPS (przekierowanie http → https)
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-400">Wersja domeny
            <select value={state.wwwMode ?? 'none'} onChange={(e) => persist({ ...state, wwwMode: e.target.value as 'none' | 'www' | 'nonwww' }, 'Zapisano kanonizację domeny')} disabled={saving} className={field}>
              <option value="none">Bez zmian</option>
              <option value="nonwww">Bez www (example.pl)</option>
              <option value="www">Z www (www.example.pl)</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">Uwaga: wymuszaj HTTPS dopiero, gdy masz aktywny certyfikat SSL (zakładka SSL), aby uniknąć pętli/ostrzeżeń.</p>
      </section>

      {/* Przekierowania */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ArrowRightLeft className="h-4 w-4 text-emerald-300" /> Przekierowania URL</h3>
        <p className="mt-1 text-xs text-neutral-400">Trwałe (301) lub tymczasowe (302) przekierowanie adresu na inny URL.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.3fr_auto_auto]">
          <input value={rFrom} onChange={(e) => setRFrom(e.target.value)} placeholder="/stara-strona" className={field} />
          <input value={rTo} onChange={(e) => setRTo(e.target.value)} placeholder="https://cel.pl/nowa" className={field} />
          <select value={rType} onChange={(e) => setRType(e.target.value as '301' | '302')} className={field}><option value="301">301 (trwałe)</option><option value="302">302 (tymczasowe)</option></select>
          <Button onClick={addRedirect} disabled={saving} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs"><Plus className="h-3.5 w-3.5" /> Dodaj</Button>
        </div>
        {state.redirects.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {state.redirects.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <div className="min-w-0 truncate"><span className="font-mono text-white">{r.from}</span><span className="text-neutral-500"> → </span><span className="truncate text-neutral-300">{r.to}</span> <span className="text-[10px] text-neutral-500">[{r.type}]</span></div>
                <button onClick={() => delRedirect(i)} className="shrink-0 text-neutral-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ochrona katalogu */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Lock className="h-4 w-4 text-emerald-300" /> Ochrona katalogu hasłem</h3>
        <p className="mt-1 text-xs text-neutral-400">Wymuś logowanie (Basic Auth) na wybranym katalogu. Pusty katalog = cała strona (public_html).</p>
        <form onSubmit={protect} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input value={pDir} onChange={(e) => setPDir(e.target.value)} placeholder="katalog (np. panel) — puste = cała strona" className={field} />
          <input value={pUser} onChange={(e) => setPUser(e.target.value)} placeholder="użytkownik" className={field} />
          <input value={pPass} onChange={(e) => setPPass(e.target.value)} type="password" placeholder="hasło (min. 6)" className={field} />
          <Button type="submit" disabled={pBusy} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs">{pBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Zabezpiecz</Button>
        </form>
        {state.protectedDirs.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {state.protectedDirs.map((d) => (
              <div key={d} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <span className="font-mono text-white">{d === '/' ? '/ (cała strona)' : d}</span>
                <button onClick={() => unprotect(d)} className="shrink-0 text-neutral-500 hover:text-rose-300" title="Zdejmij ochronę"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Antyhotlink */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ImageOff className="h-4 w-4 text-emerald-300" /> Ochrona przed hotlinkingiem</h3>
        <p className="mt-1 text-xs text-neutral-400">Blokuje wyświetlanie Twoich obrazów na obcych stronach (kradzież transferu).</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={state.hotlink.enabled} onChange={toggleHotlink} className="h-4 w-4 accent-emerald-500" /> Włączona
          </label>
          <input value={state.hotlink.extensions} onChange={(e) => saveHotlinkExt(e.target.value)} placeholder="jpg,png,gif,webp" className={`${field} flex-1 min-w-[180px]`} />
          <Button onClick={() => persist(state, 'Zapisano rozszerzenia')} disabled={saving} className="h-9 bg-white/10 text-white hover:bg-white/20 text-xs">Zapisz rozszerzenia</Button>
        </div>
      </section>

      {/* Blokada IP */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldBan className="h-4 w-4 text-emerald-300" /> Blokowanie adresów IP</h3>
        <p className="mt-1 text-xs text-neutral-400">Odmów dostępu wskazanym adresom (obsługa pojedynczych IP i zakresów CIDR).</p>
        <div className="mt-3 flex gap-2">
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="np. 203.0.113.5 lub 203.0.113.0/24" className={`${field} flex-1`} />
          <Button onClick={addIp} disabled={saving} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs"><Plus className="h-3.5 w-3.5" /> Zablokuj</Button>
        </div>
        {state.blockedIps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {state.blockedIps.map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-sm text-white">
                <span className="font-mono">{v}</span>
                <button onClick={() => delIp(v)} className="text-neutral-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        )}
      </section>
    </HostingTabShell>
  );
}

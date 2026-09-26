'use client';

import { useCallback, useEffect, useId, useState } from 'react';
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
import { Select } from '@/components/panel/select';
import { potwierdz } from '@/components/panel/potwierdz';
import { Checkbox } from '@/components/panel/checkbox';

const field = 'rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground';
const EMPTY: WebToolsState = { redirects: [], hotlink: { enabled: false, extensions: 'jpg,jpeg,png,gif,webp,svg', allow: [] }, blockedIps: [], protectedDirs: [], forceHttps: false, wwwMode: 'none' };

export default function WebToolsTab({ serviceId }: { serviceId: string }) {
  const wwwModeId = useId();
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

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const load = useCallback(
    () =>
      fetchWebToolsAction(serviceId)
        .then((res) => {
          setState({ ...EMPTY, ...res.state, hotlink: { ...EMPTY.hotlink, ...res.state.hotlink } });
          setFetchError(res.fetchError);
        })
        .catch((e) => {
          setFetchError(e instanceof Error ? e.message : 'Nie udało się pobrać ustawień.');
        })
        .finally(() => {
          setLoading(false);
        }),
    [serviceId],
  );
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
    const to = rTo.trim();
    // Cel musi być pełnym adresem (https://…) albo ścieżką na tej samej stronie (/…).
    if (!/^https?:\/\//i.test(to) && !to.startsWith('/')) {
      toast.error('Cel musi być pełnym adresem (https://…) lub ścieżką zaczynającą się od /.');
      return;
    }
    const next = { ...state, redirects: [...state.redirects, { from, to, type: rType } as Redirect] };
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
    if (!(await potwierdz(`Zdjąć ochronę z „${dir}"?`, { akcja: 'Zdejmij', niebezpieczne: true }))) return;
    const res = await removeDirProtectionAction(serviceId, dir === '/' ? '' : dir);
    if (!res.ok) { toast.error('Nie udało się zdjąć ochrony', { description: daErrorMessage(res.error) }); return; }
    toast.success('Ochrona zdjęta'); void load();
  };

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Wczytywanie narzędzi…</div>;
  }

  return (
    <HostingTabShell
      title="Narzędzia WWW"
      description="Przekierowania, ochrona katalogów hasłem, ochrona przed hotlinkingiem i blokowanie adresów IP — zapisywane wprost do pliku .htaccess Twojej strony."
    >
      {fetchError && <p className="mb-3 rounded-[7px] border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">{fetchError}</p>}

      {/* HTTPS i kanonizacja domeny */}
      <section className="rounded-[10px] border border-line bg-raised p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Lock className="h-4 w-4 text-data-hi" /> HTTPS i kanonizacja domeny</h3>
        <p className="mt-1 text-xs text-muted-foreground">Wymuś bezpieczne połączenie i jedną wersję adresu (z www lub bez) — lepsze SEO i brak duplikatów treści.</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[color:var(--verris-body)]">
            <Checkbox checked={Boolean(state.forceHttps)} onChange={(e) => persist({ ...state, forceHttps: e.target.checked }, e.target.checked ? 'Wymuszanie HTTPS włączone' : 'Wymuszanie HTTPS wyłączone')} disabled={saving} className="h-4 w-4 accent-emerald-500" />
            Wymuś HTTPS (przekierowanie http → https)
          </label>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor={wwwModeId}>Wersja domeny</label>
            <Select
              id={wwwModeId}
              value={state.wwwMode ?? 'none'}
              onChange={(v) => {
                if (v !== (state.wwwMode ?? 'none')) persist({ ...state, wwwMode: v as 'none' | 'www' | 'nonwww' }, 'Zapisano kanonizację domeny');
              }}
              disabled={saving}
              className="w-56"
              options={[
                { value: 'none', label: 'Bez zmian' },
                { value: 'nonwww', label: 'Bez www (example.pl)' },
                { value: 'www', label: 'Z www (www.example.pl)' },
              ]}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Uwaga: wymuszaj HTTPS dopiero, gdy masz aktywny certyfikat SSL (zakładka SSL), aby uniknąć pętli/ostrzeżeń.</p>
      </section>

      {/* Przekierowania */}
      <section className="mt-6 rounded-[10px] border border-line bg-raised p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ArrowRightLeft className="h-4 w-4 text-data-hi" /> Przekierowania URL</h3>
        <p className="mt-1 text-xs text-muted-foreground">Trwałe (301) lub tymczasowe (302) przekierowanie adresu na inny URL. Przy zmianie adresu strony wybierz <span className="text-[color:var(--verris-body)]">301 (trwałe)</span> — wyszukiwarki przeniosą pozycję na nowy adres.</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Przykład: <span className="font-mono text-[color:var(--verris-body)]">/oferta</span> → <span className="font-mono text-[color:var(--verris-body)]">https://twojadomena.pl/cennik</span>. W polu „z” podaj samą ścieżkę (od <span className="font-mono">/</span>), w polu „na” pełny adres lub ścieżkę.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.3fr_auto_auto]">
          <input value={rFrom} onChange={(e) => setRFrom(e.target.value)} placeholder="/stara-strona" className={field} />
          <input value={rTo} onChange={(e) => setRTo(e.target.value)} placeholder="https://cel.pl/nowa" className={field} />
          <Select aria-label="Typ przekierowania" value={rType} onChange={(v) => setRType(v as '301' | '302')} className="sm:w-44" options={[{ value: '301', label: '301 (trwałe)' }, { value: '302', label: '302 (tymczasowe)' }]} />
          <Button onClick={addRedirect} disabled={saving} className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs"><Plus className="h-3.5 w-3.5" /> Dodaj</Button>
        </div>
        {state.redirects.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {state.redirects.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-[7px] border border-line bg-background px-3 py-2 text-sm">
                <div className="min-w-0 break-words"><span className="font-mono text-foreground">{r.from}</span><span className="text-muted-foreground"> → </span><span className="break-words text-[color:var(--verris-body)]">{r.to}</span> <span className="text-[10px] text-muted-foreground">[{r.type}]</span></div>
                <button onClick={() => delRedirect(i)} className="shrink-0 text-muted-foreground hover:text-crit"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ochrona katalogu */}
      <section className="mt-6 rounded-[10px] border border-line bg-raised p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Lock className="h-4 w-4 text-data-hi" /> Ochrona katalogu hasłem</h3>
        <p className="mt-1 text-xs text-muted-foreground">Wymuś logowanie (Basic Auth) na wybranym katalogu. Pusty katalog = cała strona (public_html).</p>
        <form onSubmit={protect} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input value={pDir} onChange={(e) => setPDir(e.target.value)} placeholder="katalog (np. panel) — puste = cała strona" className={field} />
          <input value={pUser} onChange={(e) => setPUser(e.target.value)} placeholder="użytkownik" className={field} />
          <input value={pPass} onChange={(e) => setPPass(e.target.value)} type="password" placeholder="hasło (min. 6)" className={field} />
          <Button type="submit" disabled={pBusy} className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs">{pBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Zabezpiecz</Button>
        </form>
        {state.protectedDirs.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {state.protectedDirs.map((d) => (
              <div key={d} className="flex items-center justify-between gap-2 rounded-[7px] border border-line bg-background px-3 py-2 text-sm">
                <span className="font-mono text-foreground">{d === '/' ? '/ (cała strona)' : d}</span>
                <button onClick={() => unprotect(d)} className="shrink-0 text-muted-foreground hover:text-crit" title="Zdejmij ochronę"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Antyhotlink */}
      <section className="mt-6 rounded-[10px] border border-line bg-raised p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ImageOff className="h-4 w-4 text-data-hi" /> Ochrona przed hotlinkingiem</h3>
        <p className="mt-1 text-xs text-muted-foreground">Blokuje wyświetlanie Twoich obrazów na obcych stronach (kradzież transferu).</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[color:var(--verris-body)]">
            <Checkbox checked={state.hotlink.enabled} onChange={toggleHotlink} className="h-4 w-4 accent-emerald-500" /> Włączona
          </label>
          <input value={state.hotlink.extensions} onChange={(e) => saveHotlinkExt(e.target.value)} placeholder="jpg,png,gif,webp" className={`${field} flex-1 min-w-[180px]`} />
          <Button onClick={() => persist(state, 'Zapisano rozszerzenia')} disabled={saving} className="h-9 bg-raised text-foreground hover:bg-raised text-xs">Zapisz rozszerzenia</Button>
        </div>
      </section>

      {/* Blokada IP */}
      <section className="mt-6 rounded-[10px] border border-line bg-raised p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldBan className="h-4 w-4 text-data-hi" /> Blokowanie adresów IP</h3>
        <p className="mt-1 text-xs text-muted-foreground">Odmów dostępu wskazanym adresom (obsługa pojedynczych IP i zakresów CIDR).</p>
        <div className="mt-3 flex gap-2">
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="np. 203.0.113.5 lub 203.0.113.0/24" className={`${field} flex-1`} />
          <Button onClick={addIp} disabled={saving} className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs"><Plus className="h-3.5 w-3.5" /> Zablokuj</Button>
        </div>
        {state.blockedIps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {state.blockedIps.map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-background px-2.5 py-1 text-sm text-foreground">
                <span className="font-mono">{v}</span>
                <button onClick={() => delIp(v)} className="text-muted-foreground hover:text-crit"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        )}
      </section>
    </HostingTabShell>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Forward, Inbox, Loader2, MailCheck, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import {
  fetchHostingForwardersAction,
  createHostingForwarderAction,
  deleteHostingForwarderAction,
  fetchHostingAutorespondersAction,
  setHostingAutoresponderAction,
  deleteHostingAutoresponderAction,
  fetchCatchAllAction,
  setCatchAllAction,
  fetchSpamFilterAction,
  setSpamFilterAction,
  type ForwarderRow,
  type AutoresponderRow,
} from '@/app/dashboard/services/[id]/hosting-email-actions';
import { daErrorMessage } from '@/lib/client-hosting-messages';

const fieldCls =
  'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500';

export default function MailExtras({ serviceId }: { serviceId: string }) {
  // forwarders
  const [fwRows, setFwRows] = useState<ForwarderRow[]>([]);
  const [fwErr, setFwErr] = useState<string | null>(null);
  const [fwName, setFwName] = useState('');
  const [fwDest, setFwDest] = useState('');
  const [fwBusy, setFwBusy] = useState(false);
  const [fwDel, setFwDel] = useState<string | null>(null);
  // autoresponders
  const [arRows, setArRows] = useState<AutoresponderRow[]>([]);
  const [arErr, setArErr] = useState<string | null>(null);
  const [arName, setArName] = useState('');
  const [arText, setArText] = useState('Dziękuję za wiadomość. Odpowiem najszybciej, jak to możliwe.');
  const [arBusy, setArBusy] = useState(false);
  const [arDel, setArDel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // catch-all
  const [caMode, setCaMode] = useState<'fail' | 'blackhole' | 'address'>('fail');
  const [caAddr, setCaAddr] = useState('');
  const [caBusy, setCaBusy] = useState(false);
  // spam filter
  const [spamOn, setSpamOn] = useState(false);
  const [spamScore, setSpamScore] = useState('5');
  const [spamTag, setSpamTag] = useState('***SPAM*** ');
  const [spamBusy, setSpamBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fw, ar, ca, sp] = await Promise.all([
        fetchHostingForwardersAction(serviceId).catch((e) => ({ rows: [], fetchError: e instanceof Error ? e.message : 'Błąd' })),
        fetchHostingAutorespondersAction(serviceId).catch((e) => ({ rows: [], fetchError: e instanceof Error ? e.message : 'Błąd' })),
        fetchCatchAllAction(serviceId).catch(() => null),
        fetchSpamFilterAction(serviceId).catch(() => null),
      ]);
      setFwRows(fw.rows); setFwErr(fw.fetchError);
      setArRows(ar.rows); setArErr(ar.fetchError);
      if (ca) { setCaMode(ca.mode); setCaAddr(ca.address || ''); }
      if (sp) { setSpamOn(sp.isOn); setSpamScore(sp.requiredScore || '5'); if (sp.subjectTag) setSpamTag(sp.subjectTag); }
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  const saveCatchAll = async () => {
    setCaBusy(true);
    const res = await setCatchAllAction({ subscriptionId: serviceId, mode: caMode, address: caAddr });
    setCaBusy(false);
    if (!res.ok) { toast.error('Nie udało się zapisać catch-all', { description: daErrorMessage(res.error) }); return; }
    toast.success('Catch-all zapisany');
  };
  const saveSpam = async (enabled: boolean) => {
    setSpamBusy(true);
    const res = await setSpamFilterAction({ subscriptionId: serviceId, enabled, requiredScore: spamScore, subjectTag: spamTag });
    setSpamBusy(false);
    if (!res.ok) { toast.error('Nie udało się zapisać filtra', { description: daErrorMessage(res.error) }); return; }
    setSpamOn(enabled);
    toast.success(enabled ? 'Filtr antyspam włączony' : 'Filtr antyspam wyłączony');
  };

  useEffect(() => { void load(); }, [load]);

  const addForward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fwName.trim() || !fwDest.trim()) { toast.error('Podaj nazwę aliasu i adres docelowy.'); return; }
    setFwBusy(true);
    const res = await createHostingForwarderAction({ subscriptionId: serviceId, name: fwName.trim(), destinations: fwDest.trim() });
    setFwBusy(false);
    if (!res.ok) { toast.error('Nie udało się dodać aliasu', { description: daErrorMessage(res.error) }); return; }
    toast.success('Alias dodany'); setFwName(''); setFwDest(''); void load();
  };
  const delForward = async (name: string) => {
    if (!window.confirm(`Usunąć alias „${name}"?`)) return;
    setFwDel(name);
    const res = await deleteHostingForwarderAction(serviceId, name);
    setFwDel(null);
    if (!res.ok) { toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) }); return; }
    toast.success('Alias usunięty'); void load();
  };

  const saveAr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arName.trim() || !arText.trim()) { toast.error('Podaj skrzynkę i treść autorespondera.'); return; }
    setArBusy(true);
    const res = await setHostingAutoresponderAction({ subscriptionId: serviceId, name: arName.trim(), text: arText.trim() });
    setArBusy(false);
    if (!res.ok) { toast.error('Nie udało się zapisać autorespondera', { description: daErrorMessage(res.error) }); return; }
    toast.success('Autoresponder zapisany'); setArName(''); void load();
  };
  const delAr = async (name: string) => {
    if (!window.confirm(`Wyłączyć autoresponder dla „${name}"?`)) return;
    setArDel(name);
    const res = await deleteHostingAutoresponderAction(serviceId, name);
    setArDel(null);
    if (!res.ok) { toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) }); return; }
    toast.success('Autoresponder wyłączony'); void load();
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Forwardery */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Forward className="h-4 w-4 text-emerald-300" /> Aliasy / przekierowania poczty
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          Adres typu alias (np. <span className="font-mono">biuro@</span>) przekazujący pocztę na jedną lub kilka skrzynek — bez zakładania osobnego konta.
        </p>
        <form onSubmit={addForward} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input value={fwName} onChange={(e) => setFwName(e.target.value)} placeholder="alias (lewa część przed @)" className={fieldCls} />
          <input value={fwDest} onChange={(e) => setFwDest(e.target.value)} placeholder="adres docelowy (kilka po przecinku)" className={fieldCls} />
          <Button type="submit" disabled={fwBusy} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs">
            {fwBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Dodaj alias
          </Button>
        </form>
        {loading ? (
          <p className="mt-3 text-xs text-neutral-500"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Wczytywanie…</p>
        ) : fwErr ? (
          <p className="mt-3 text-xs text-amber-300/80">{fwErr}</p>
        ) : fwRows.length === 0 ? (
          <p className="mt-3 text-xs text-neutral-500">Brak aliasów — dodaj pierwszy powyżej.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {fwRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-white">{r.email}</span>
                  <span className="text-neutral-500"> → </span>
                  <span className="truncate text-neutral-300">{r.destinations.join(', ')}</span>
                </div>
                <button onClick={() => delForward(r.name)} disabled={fwDel === r.name} className="shrink-0 text-neutral-500 hover:text-rose-300" title="Usuń alias">
                  {fwDel === r.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Autorespondery */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <MailCheck className="h-4 w-4 text-emerald-300" /> Autorespondery (wiadomości automatyczne)
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          Automatyczna odpowiedź wysyłana z wybranej skrzynki — np. komunikat urlopowy „Wrócę 15 lipca".
        </p>
        <form onSubmit={saveAr} className="mt-3 space-y-2">
          <input value={arName} onChange={(e) => setArName(e.target.value)} placeholder="skrzynka (lewa część przed @, np. kontakt)" className={fieldCls} />
          <textarea value={arText} onChange={(e) => setArText(e.target.value)} rows={3} placeholder="Treść automatycznej odpowiedzi" className={fieldCls} />
          <Button type="submit" disabled={arBusy} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs">
            {arBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Zapisz autoresponder
          </Button>
        </form>
        {loading ? null : arErr ? (
          <p className="mt-3 text-xs text-amber-300/80">{arErr}</p>
        ) : arRows.length === 0 ? (
          <p className="mt-3 text-xs text-neutral-500">Brak aktywnych autoresponderów.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {arRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <span className="font-medium text-white">{r.email}</span>
                <button onClick={() => delAr(r.name)} disabled={arDel === r.name} className="shrink-0 text-neutral-500 hover:text-rose-300" title="Wyłącz autoresponder">
                  {arDel === r.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Catch-all */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Inbox className="h-4 w-4 text-emerald-300" /> Catch-all (poczta na nieistniejące adresy)</h3>
        <p className="mt-1 text-xs text-neutral-400">Co zrobić z e-mailami wysłanymi na adres, który nie istnieje w Twojej domenie.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={caMode} onChange={(e) => setCaMode(e.target.value as 'fail' | 'blackhole' | 'address')} className={fieldCls + ' max-w-[230px]'}>
            <option value="fail">Odrzucaj (zalecane)</option>
            <option value="blackhole">Przyjmij i wyrzuć po cichu</option>
            <option value="address">Przekaż na adres…</option>
          </select>
          {caMode === 'address' && (
            <input value={caAddr} onChange={(e) => setCaAddr(e.target.value)} placeholder="adres docelowy" className={fieldCls + ' flex-1 min-w-[200px]'} />
          )}
          <Button onClick={saveCatchAll} disabled={caBusy} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs">{caBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Zapisz</Button>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">„Odrzucaj" ogranicza spam (nadawca dostaje błąd). „Przyjmij i wyrzuć" cicho kasuje — bez powiadomienia nadawcy.</p>
      </section>

      {/* Filtr antyspam */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Filtr antyspam (SpamAssassin)</h3>
        <p className="mt-1 text-xs text-neutral-400">Skanuje pocztę przychodzącą i oznacza spam. Im niższy próg, tym ostrzejszy filtr.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={spamOn} onChange={(e) => saveSpam(e.target.checked)} disabled={spamBusy} className="h-4 w-4 accent-emerald-500" /> Włączony
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-400">Próg (czułość)
            <input value={spamScore} onChange={(e) => setSpamScore(e.target.value.replace(/[^0-9.]/g, ''))} className={fieldCls + ' w-16'} />
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-400 flex-1 min-w-[200px]">Tag tematu
            <input value={spamTag} onChange={(e) => setSpamTag(e.target.value)} className={fieldCls + ' flex-1'} />
          </label>
          <Button onClick={() => saveSpam(true)} disabled={spamBusy} className="h-9 gap-1.5 bg-white/10 text-white hover:bg-white/20 text-xs">{spamBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Zapisz ustawienia</Button>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">Typowy próg to 5. Wiadomości powyżej progu dostają tag w temacie (np. „***SPAM***").</p>
      </section>
    </div>
  );
}

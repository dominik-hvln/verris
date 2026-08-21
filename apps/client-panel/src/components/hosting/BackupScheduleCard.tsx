'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import {
  fetchBackupScheduleAction,
  setBackupScheduleAction,
  type BackupFrequency,
} from '@/app/dashboard/services/[id]/hosting-backup-schedule-actions';
import { daErrorMessage } from '@/lib/client-hosting-messages';

const fieldCls = 'rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white';
const DOW = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

export default function BackupScheduleCard({ serviceId }: { serviceId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [frequency, setFrequency] = useState<BackupFrequency>('OFF');
  const [hour, setHour] = useState(3);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [retainCount, setRetainCount] = useState(7);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchBackupScheduleAction(serviceId);
      setFrequency(s.frequency); setHour(s.hour); setDayOfWeek(s.dayOfWeek);
      setRetainCount(s.retainCount ?? 7);
      setLastRunAt(s.lastRunAt); setLastStatus(s.lastStatus);
    } catch { /* domyślne */ } finally { setLoading(false); }
  }, [serviceId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const res = await setBackupScheduleAction({ subscriptionId: serviceId, frequency, hour, dayOfWeek, enabled: frequency !== 'OFF', retainCount });
    setSaving(false);
    if (!res.ok) { toast.error('Nie udało się zapisać harmonogramu', { description: daErrorMessage(res.error) }); return; }
    toast.success(frequency === 'OFF' ? 'Automatyczne backupy wyłączone' : 'Harmonogram backupów zapisany');
    void load();
  };

  if (loading) {
    return <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie harmonogramu…</div>;
  }

  return (
    <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><CalendarClock className="h-4 w-4 text-emerald-300" /> Automatyczne backupy (harmonogram)</h3>
      <p className="mt-1 text-xs text-neutral-400">Verris sam wykona pełny backup konta w wybranym cyklu — nie musisz pamiętać o ręcznym tworzeniu kopii.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-400">Cykl
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as BackupFrequency)} className={fieldCls}>
            <option value="OFF">Wyłączone</option>
            <option value="DAILY">Codziennie</option>
            <option value="WEEKLY">Co tydzień</option>
          </select>
        </label>
        {frequency === 'WEEKLY' && (
          <label className="flex items-center gap-2 text-xs text-neutral-400">Dzień
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={fieldCls}>
              {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </label>
        )}
        {frequency !== 'OFF' && (
          <label className="flex items-center gap-2 text-xs text-neutral-400">Godzina (UTC)
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={fieldCls}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
        )}
        {frequency !== 'OFF' && (
          <label className="flex items-center gap-2 text-xs text-neutral-400">Trzymaj kopii
            <select value={retainCount} onChange={(e) => setRetainCount(Number(e.target.value))} className={fieldCls}>
              {[0, 3, 5, 7, 14, 30].map((n) => <option key={n} value={n}>{n === 0 ? 'Bez czyszczenia' : n}</option>)}
            </select>
          </label>
        )}
        <Button onClick={save} disabled={saving} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Zapisz harmonogram
        </Button>
      </div>
      {lastRunAt && (
        <p className="mt-2 text-[11px] text-neutral-500">
          Ostatni automatyczny backup: {new Date(lastRunAt).toLocaleString('pl-PL')}
          {lastStatus && lastStatus !== 'ok' ? <span className="text-amber-300/80"> — {lastStatus}</span> : <span className="text-emerald-300/80"> — OK</span>}
        </p>
      )}
      <p className="mt-1 text-[11px] text-neutral-500">Kopie trafiają do listy poniżej, skąd możesz je przywrócić jednym kliknięciem.</p>
    </section>
  );
}

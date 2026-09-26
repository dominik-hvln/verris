'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import {
  fetchBackupScheduleAction,
  setBackupScheduleAction,
  type BackupFrequency,
} from '@/app/dashboard/services/[id]/hosting-backup-schedule-actions';
import { daErrorMessage } from '@/lib/client-hosting-messages';
import { Select } from '@/components/panel/select';

const DOW = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

export default function BackupScheduleCard({ serviceId }: { serviceId: string }) {
  const uid = useId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [frequency, setFrequency] = useState<BackupFrequency>('OFF');
  const [hour, setHour] = useState(3);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [retainCount, setRetainCount] = useState(7);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const load = useCallback(
    () =>
      fetchBackupScheduleAction(serviceId)
        .then((s) => {
          setFrequency(s.frequency); setHour(s.hour); setDayOfWeek(s.dayOfWeek);
          setRetainCount(s.retainCount ?? 7);
          setLastRunAt(s.lastRunAt); setLastStatus(s.lastStatus);
        })
        .catch(() => { /* domyślne */ })
        .finally(() => setLoading(false)),
    [serviceId],
  );
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
    return <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-line bg-raised p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie harmonogramu…</div>;
  }

  return (
    <section className="mb-4 rounded-[10px] border border-line bg-raised p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarClock className="h-4 w-4 text-data-hi" /> Automatyczne backupy (harmonogram)</h3>
      <p className="mt-1 text-xs text-muted-foreground">Verris sam wykona pełny backup konta w wybranym cyklu — nie musisz pamiętać o ręcznym tworzeniu kopii.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <label htmlFor={`${uid}-freq`}>Cykl</label>
          <Select
            id={`${uid}-freq`}
            value={frequency}
            onChange={(v) => setFrequency(v as BackupFrequency)}
            className="w-40"
            options={[
              { value: 'OFF', label: 'Wyłączone' },
              { value: 'DAILY', label: 'Codziennie' },
              { value: 'WEEKLY', label: 'Co tydzień' },
            ]}
          />
        </div>
        {frequency === 'WEEKLY' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor={`${uid}-dow`}>Dzień</label>
            <Select
              id={`${uid}-dow`}
              value={String(dayOfWeek)}
              onChange={(v) => setDayOfWeek(Number(v))}
              className="w-44"
              options={DOW.map((d, i) => ({ value: String(i), label: d }))}
            />
          </div>
        )}
        {frequency !== 'OFF' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor={`${uid}-hour`}>Godzina (UTC)</label>
            <Select
              id={`${uid}-hour`}
              value={String(hour)}
              onChange={(v) => setHour(Number(v))}
              className="w-28"
              options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))}
            />
          </div>
        )}
        {frequency !== 'OFF' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor={`${uid}-retain`}>Trzymaj kopii</label>
            <Select
              id={`${uid}-retain`}
              value={String(retainCount)}
              onChange={(v) => setRetainCount(Number(v))}
              className="w-44"
              options={[0, 3, 5, 7, 14, 30].map((n) => ({ value: String(n), label: n === 0 ? 'Bez czyszczenia' : String(n) }))}
            />
          </div>
        )}
        <Button onClick={save} disabled={saving} className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Zapisz harmonogram
        </Button>
      </div>
      {lastRunAt && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ostatni automatyczny backup: {new Date(lastRunAt).toLocaleString('pl-PL')}
          {lastStatus && lastStatus !== 'ok' ? <span className="text-warn"> — {lastStatus}</span> : <span className="text-data-hi"> — OK</span>}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Kopie trafiają do listy poniżej, skąd możesz je przywrócić jednym kliknięciem.</p>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import type { HostingCronJobDto } from '@verris/contracts';
import {
  createHostingCronAction,
  deleteHostingCronAction,
  fetchCronOutputAction,
  fetchHostingCronAction,
  updateHostingCronAction,
} from '@/app/dashboard/services/[id]/hosting-extra-actions';
import { newCronKey, unwrapCron, wrapCron } from '@/components/hosting/cron-output';
import { daErrorMessage, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { HostingHelpHint } from '@/components/hosting/HostingTabShell';
import { potwierdz } from '@/components/panel/potwierdz';
import { CronPhpHelper } from '@/components/hosting/CronPhpHelper';

type Sched = { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string };
const EVERY: Sched = { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };

const PRESETS: { label: string; value: Sched }[] = [
  { label: 'Co 5 min', value: { ...EVERY, minute: '*/5' } },
  { label: 'Co godzinę', value: { ...EVERY, minute: '0' } },
  { label: 'Codziennie 3:00', value: { ...EVERY, minute: '0', hour: '3' } },
  { label: 'Co poniedziałek 4:00', value: { ...EVERY, minute: '0', hour: '4', dayOfWeek: '1' } },
];

export default function CronTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<HostingCronJobDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [sched, setSched] = useState<Sched>({ ...EVERY, minute: '0', hour: '3' });
  const [command, setCommand] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // L-06 — zapis wyniku ostatniego uruchomienia (polecenie opakowane, plik ~/.verris-cron/<klucz>.log).
  const [zapisuj, setZapisuj] = useState(true);
  const [klucz, setKlucz] = useState<string | null>(null);
  const [wynik, setWynik] = useState<{ id: string; tekst: string | null; blad?: string } | null>(null);

  // Samo pobranie — efekt montażu startuje z `loading` już ustawionym na `true`.
  const fetchRows = () =>
    fetchHostingCronAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać zadań cron.'))
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
    setCreating(true);
    const input = { ...sched, command: zapisuj ? wrapCron(command, klucz ?? newCronKey()) : command.trim() };
    const res = editingId
      ? await updateHostingCronAction(serviceId, editingId, input)
      : await createHostingCronAction(serviceId, input);
    setCreating(false);
    if (!res.ok) {
      return toast.error(editingId ? 'Nie udało się zapisać zmian' : 'Nie udało się dodać zadania', {
        description: daErrorMessage(res.error),
      });
    }
    toast.success(editingId ? 'Zadanie cron zapisane' : 'Zadanie cron dodane');
    setCommand('');
    setEditingId(null);
    setKlucz(null);
    load();
  };

  const onEdit = (row: HostingCronJobDto) => {
    const [minute = '*', hour = '*', dayOfMonth = '*', month = '*', dayOfWeek = '*'] = row.schedule.split(/\s+/);
    setSched({ minute, hour, dayOfMonth, month, dayOfWeek });
    const u = unwrapCron(row.command);
    setCommand(u?.command ?? row.command);
    setZapisuj(Boolean(u));
    setKlucz(u?.key ?? null);
    setEditingId(row.id);
  };

  const pokazWynik = async (row: HostingCronJobDto, key: string) => {
    if (wynik?.id === row.id) return setWynik(null);
    setWynik({ id: row.id, tekst: null });
    const r = await fetchCronOutputAction(serviceId, key);
    setWynik(r.ok ? { id: row.id, tekst: r.output } : { id: row.id, tekst: '', blad: r.error });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCommand('');
    setKlucz(null);
    setZapisuj(true);
    setSched({ ...EVERY, minute: '0', hour: '3' });
  };

  const onDelete = async (id: string) => {
    if (!(await potwierdz('Usunąć to zadanie cron?', { akcja: 'Usuń', niebezpieczne: true }))) return;
    setDeleting(id);
    const res = await deleteHostingCronAction(serviceId, id);
    setDeleting(null);
    if (!res.ok) return toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) });
    toast.success('Zadanie usunięte');
    load();
  };

  const field = (key: keyof Sched, label: string) => (
    <label className="space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        value={sched[key]}
        onChange={(e) => setSched({ ...sched, [key]: e.target.value })}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-center font-mono text-sm text-white outline-none focus:border-white/30"
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <HostingHelpHint
        help={{
          blurb:
            'Cron uruchamia Twój skrypt automatycznie o wybranych porach. Użyj gotowego presetu (np. „Codziennie 3:00") — nie musisz znać składni.',
          kbQuery: 'cron zadania',
        }}
      />
      <form onSubmit={onCreate} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-sm font-semibold text-white">{editingId ? 'Edycja zadania cron' : 'Nowe zadanie cron'}</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setSched(p.value)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/10"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {field('minute', 'Min')}
          {field('hour', 'Godz')}
          {field('dayOfMonth', 'Dzień')}
          {field('month', 'Mies')}
          {field('dayOfWeek', 'Dz.tyg')}
        </div>
        <label className="mt-3 block space-y-1">
          <span className="text-xs text-neutral-400">Komenda</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="np. php /home/user/domains/twojadomena.pl/public_html/cron.php"
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
          />
        </label>
        <CronPhpHelper serviceId={serviceId} onUse={setCommand} />
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <button
            type="button"
            role="checkbox"
            aria-checked={zapisuj}
            onClick={() => setZapisuj((v) => !v)}
            className={`inline-flex h-4 w-4 items-center justify-center rounded-[4px] border ${zapisuj ? 'border-data bg-data text-primary-foreground' : 'border-line-strong bg-raised'}`}
          >
            {zapisuj ? '✓' : null}
          </button>
          Zapisuj wynik ostatniego uruchomienia (podgląd przy zadaniu)
        </label>
        <div className="mt-3 flex justify-end gap-2">
          {editingId ? (
            <Button type="button" size="sm" variant="outline" onClick={cancelEdit} className="h-8 text-xs">
              Anuluj edycję
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={creating || !command.trim()}
            className="h-8 gap-1.5 bg-white text-black hover:bg-neutral-200 text-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {editingId ? 'Zapisz zmiany' : 'Dodaj zadanie'}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200/90">
          {hostingFetchErrorMessage(error)}
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-neutral-500">
          <Clock className="h-8 w-8 opacity-20" />
          Nie skonfigurowano jeszcze zadań cyklicznych.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-neutral-400">{row.schedule}</p>
                <p className="mt-1 break-all font-mono text-sm text-white">{unwrapCron(row.command)?.command ?? row.command}</p>
                {(() => {
                  const u = unwrapCron(row.command);
                  if (!u) return null;
                  return (
                    <>
                      <button type="button" onClick={() => void pokazWynik(row, u.key)} className="mt-2 text-xs font-semibold text-data hover:underline">
                        {wynik?.id === row.id ? 'Ukryj wynik' : 'Wynik ostatniego uruchomienia'}
                      </button>
                      {wynik?.id === row.id ? (
                        wynik.tekst === null ? (
                          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wczytywanie…</p>
                        ) : wynik.blad ? (
                          <p className="mt-2 text-xs text-crit">{wynik.blad}</p>
                        ) : wynik.tekst ? (
                          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-raised p-3 font-mono text-xs text-foreground">{wynik.tekst}</pre>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Zadanie jeszcze się nie uruchomiło albo nic nie wypisało.</p>
                        )
                      ) : null}
                    </>
                  );
                })()}
              </div>
              <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                title="Edytuj zadanie"
                aria-label="Edytuj zadanie"
                onClick={() => onEdit(row)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Usuń zadanie"
                disabled={deleting === row.id}
                onClick={() => void onDelete(row.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {deleting === row.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

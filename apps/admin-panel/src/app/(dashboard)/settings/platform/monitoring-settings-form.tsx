'use client';

import { useActionState } from 'react';
import { Loader2, Save, Activity } from 'lucide-react';
import { updateMonitoringSettingsAction, type MonitoringSettingsForm } from './actions';

export function MonitoringSettingsForm({ initial }: { initial: MonitoringSettingsForm }) {
  const [state, action, pending] = useActionState(updateMonitoringSettingsAction, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-2xl">
      <legend className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <Activity className="h-4 w-4" /> Monitoring strony
      </legend>
      <p className="text-xs text-neutral-400">
        Darmowy monitoring jest domyślnie włączony dla nowych usług hostingowych. Płatny tier
        sprawdza częściej i jest rozliczany miesięcznie z portfela klienta.
      </p>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="text-sm text-white">Oferuj klientom płatny (szybki) monitoring</span>
        <input type="checkbox" name="paidOffered" defaultChecked={initial.paidOffered} className="h-4 w-4 accent-emerald-500" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          name="freeIntervalMinutes"
          label="Darmowy interwał (min)"
          defaultValue={initial.freeIntervalMinutes}
          min={1}
          max={1440}
          hint="Co ile minut sprawdzamy darmowe usługi. Np. 30."
        />
        <NumberField
          name="paidIntervalMinutes"
          label="Płatny interwał (min)"
          defaultValue={initial.paidIntervalMinutes}
          min={1}
          max={60}
          hint="Co ile minut sprawdzamy płatne usługi. Np. 1."
        />
        <NumberField
          name="paidMonthlyPrice"
          label="Cena płatnego monitoringu (K / mies.)"
          defaultValue={initial.paidMonthlyPrice}
          min={0}
          max={100000}
          hint="Miesięczna opłata z portfela klienta. 0 = za darmo."
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz monitoring
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">Zapisano.</span> : null}
        {state.error ? <span className="text-xs text-rose-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  hint,
  min,
  max,
}: {
  name: string;
  label: string;
  defaultValue: number;
  hint?: string;
  min: number;
  max: number;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-neutral-300">{label}</span>
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
      />
      {hint ? <span className="block text-[11px] text-neutral-500">{hint}</span> : null}
    </label>
  );
}

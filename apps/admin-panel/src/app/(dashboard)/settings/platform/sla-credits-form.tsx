'use client';

import { useActionState } from 'react';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import { updateSlaCreditPolicyAction, type SlaCreditPolicyForm } from './actions';

export function SlaCreditsForm({ initial }: { initial: SlaCreditPolicyForm }) {
  const [state, action, pending] = useActionState(updateSlaCreditPolicyAction, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-2xl">
      <legend className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <ShieldCheck className="h-4 w-4" /> Kredyty SLA
      </legend>
      <p className="text-xs text-neutral-400">
        Automatyczne uznanie portfela klienta za przestój infrastruktury, wykryty przez monitoring
        floty (incydenty status-probe o istotności MAJOR). Kredyt liczony proporcjonalnie do czasu
        przestoju z mnożnikiem i limitem poniżej. <strong>Zalecane: najpierw przetestuj, potem włącz.</strong>
      </p>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="text-sm text-white">Automatyczne kredyty SLA włączone</span>
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-4 w-4 accent-emerald-500" />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          name="graceMinutes"
          label="Próg (min)"
          defaultValue={initial.graceMinutes}
          min={0}
          max={1440}
          hint="Krótszy przestój nie generuje kredytu."
        />
        <NumberField
          name="multiplier"
          label="Mnożnik"
          defaultValue={initial.multiplier}
          min={1}
          max={1000}
          hint="Kredytujemy mnożnik × czas przestoju jako czas usługi."
        />
        <NumberField
          name="capPercent"
          label="Limit (% / mies.)"
          defaultValue={initial.capPercent}
          min={1}
          max={1000}
          hint="Maks. kredyt jako % ceny miesięcznej na incydent."
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz politykę SLA
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

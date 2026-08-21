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
        floty (incydenty status-probe o istotności MAJOR). Rekompensata liczona z{' '}
        <strong>dostępności w miesiącu kalendarzowym</strong> wg progów §15 regulaminu
        (99,0–99,5% → 5%; 95–99% → 25%; 90–95% → 50%; poniżej 90% → 100%). Jedna wypłata na usługę
        na miesiąc. <strong>Zalecane: najpierw przetestuj, potem włącz.</strong>
      </p>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="text-sm text-white">Automatyczne kredyty SLA włączone</span>
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-4 w-4 accent-emerald-500" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          name="graceMinutes"
          label="Próg wykrywalności (min)"
          defaultValue={initial.graceMinutes}
          min={0}
          max={1440}
          hint="Łączny przestój krótszy w miesiącu nie generuje kredytu."
        />
        <NumberField
          name="maintenanceCapMinutes"
          label="Limit konserwacji (min / mies.)"
          defaultValue={initial.maintenanceCapMinutes}
          min={0}
          max={44640}
          hint="Okna konserwacyjne odliczane od przestoju (§15 ust. 7: 8 h = 480 min)."
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

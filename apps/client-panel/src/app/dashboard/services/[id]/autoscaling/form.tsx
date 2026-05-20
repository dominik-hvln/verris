'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { Loader2, Save, Sparkles, ShieldCheck, Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { updateAutoscalingAction, type UpdateAutoscalingState } from './actions';

interface Props {
  subscriptionId: string;
  enabled: boolean;
  maxMonthlyCost: number;
  scaleCpu: boolean;
  scaleRam: boolean;
  scaleDisk: boolean;
}

export function AutoscalingForm({
  subscriptionId,
  enabled: initialEnabled,
  maxMonthlyCost: initialCap,
  scaleCpu: initialScaleCpu,
  scaleRam: initialScaleRam,
  scaleDisk: initialScaleDisk,
}: Props) {
  const [state, formAction, pending] = useActionState<UpdateAutoscalingState, FormData>(
    (prev, formData) => updateAutoscalingAction(subscriptionId, prev, formData),
    {},
  );

  const [enabled, setEnabled] = useState(initialEnabled);
  const [cap, setCap] = useState<string>(initialCap > 0 ? initialCap.toFixed(2) : '');
  const [scaleCpu, setScaleCpu] = useState(initialScaleCpu);
  const [scaleRam, setScaleRam] = useState(initialScaleRam);
  const [scaleDisk, setScaleDisk] = useState(initialScaleDisk);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-6 space-y-6"
    >
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          Ustawienia
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          Autoskalowanie tymczasowo zwiększa wybrane zasoby ponad plan przy skoku ruchu.
          Naliczenie godzinowe trafia do portfela według cennika (CPU, RAM, dysk).
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 cursor-pointer">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-white/20 bg-black accent-emerald-500"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            Autoskalowanie włączone
            {enabled && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                <ShieldCheck className="h-3 w-3" /> Aktywne
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Bez autoskalowania strona nie skorzysta z większych limitów podczas piku —
            może odpowiadać wolniej, ale nie zostanie obciążona dodatkowo.
          </p>
        </div>
      </label>

      <fieldset
        disabled={!enabled}
        className={`space-y-3 rounded-xl border border-white/5 p-4 ${!enabled ? 'opacity-50' : ''}`}
      >
        <legend className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">
          Skaluj zasoby
        </legend>
        <ResourceToggle
          icon={<Cpu className="h-4 w-4 text-emerald-400" />}
          label="CPU"
          hint="Dodatkowy procent mocy ponad plan"
          name="scaleCpu"
          checked={scaleCpu}
          onChange={setScaleCpu}
        />
        <ResourceToggle
          icon={<MemoryStick className="h-4 w-4 text-emerald-400" />}
          label="RAM"
          hint="Dodatkowa pamięć ponad plan (GB)"
          name="scaleRam"
          checked={scaleRam}
          onChange={setScaleRam}
        />
        <ResourceToggle
          icon={<HardDrive className="h-4 w-4 text-emerald-400" />}
          label="Dysk"
          hint="Dodatkowa przestrzeń ponad plan (GB)"
          name="scaleDisk"
          checked={scaleDisk}
          onChange={setScaleDisk}
        />
      </fieldset>

      <div>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Limit miesięczny (K)
          </span>
          <input
            type="number"
            name="maxMonthlyCost"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            min="0"
            max="99999.99"
            step="0.01"
            placeholder="np. 50.00 — zostaw puste dla braku limitu"
            className="mt-1.5 w-full rounded-lg bg-black border border-white/10 px-3 py-2.5 text-white focus:border-emerald-400 focus:outline-none"
          />
        </label>
        <p className="mt-2 text-[11px] text-neutral-500">
          Po przekroczeniu liczby kredytów (1 zł = 1 K) silnik nie zwiększy więcej zasobów
          do końca okresu rozliczeniowego — w razie skoku strona zwolni, ale nie
          wygenerujesz dodatkowych kosztów.
        </p>
      </div>

      {state.error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {state.error}
        </div>
      )}
      {state.ok && state.message && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-5 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(16,185,129,0.45)] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {pending ? 'Zapisywanie…' : 'Zapisz ustawienia'}
      </button>
    </form>
  );
}

function ResourceToggle({
  icon,
  label,
  hint,
  name,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black accent-emerald-500"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          {icon}
          Skaluj {label}
        </div>
        <p className="text-[11px] text-neutral-500">{hint}</p>
      </div>
    </label>
  );
}

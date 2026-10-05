'use client';

import { useActionState } from 'react';
import { Loader2, Save, EyeOff } from 'lucide-react';
import { updateWhoisPrivacyPriceAction } from './actions';

/** A-14 — cena ukrycia danych w WHOIS dla klienta; puste = usługa niedostępna. */
export function WhoisPrivacyForm({ initial }: { initial: string | null }) {
  const [state, action, pending] = useActionState(updateWhoisPrivacyPriceAction, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-2xl">
      <legend className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <EyeOff className="h-4 w-4" /> Ukrycie danych w WHOIS (domeny)
      </legend>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-300">Cena brutto za rok (K)</span>
        <input
          type="text"
          inputMode="decimal"
          name="whoisPrivacyPrice"
          defaultValue={initial ?? ''}
          placeholder="np. 29,99"
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
        />
        <span className="block text-[11px] text-neutral-500">
          OpenProvider pobiera opłatę za każdą domenę — wpisz cenę brutto za rok dla klienta; puste = usługa niedostępna.
        </span>
      </label>
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz cenę
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">Zapisano.</span> : null}
        {state.error ? <span className="text-xs text-rose-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { wlaczWebhookOpAction } from './actions';

/** Webhook OpenProvidera: transfery, rejestracje i usunięcia domen od razu, bez czekania na sprawdzanie co godzinę. */
export function WebhookOpForm() {
  const [state, action, pending] = useActionState(wlaczWebhookOpAction, {});
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-2xl">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <BellRing className="h-4 w-4" /> Powiadomienia OpenProvidera
      </p>
      <p className="text-xs text-neutral-400">
        Zgłasza OpenProviderowi adres API z kluczem i sekretem z .env.prod (prod-ustaw-klucze.sh openprovider).
        OpenProvider od razu wysyła zdarzenie testowe — widać je w dzienniku jako REGISTRAR_WEBHOOK.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Włącz powiadomienia
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">Włączone: {state.host}</span> : null}
        {state.error ? <span className="text-xs text-rose-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

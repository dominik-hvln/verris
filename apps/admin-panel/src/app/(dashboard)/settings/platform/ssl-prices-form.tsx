'use client';

import { useActionState } from 'react';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import type { SslProduktAdminDto } from '@verris/contracts';
import { updateSslPricesAction } from './actions';

const kwota = (v: string) => Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * G-08 — cennik płatnych certyfikatów DV. Koszt to cena OpenProvidera za rok; sugestia liczona jak ceny domen
 * (kurs NBP, marża DOMAIN_PRICE_MARKUP, VAT, zaokrąglenie do ,99). Puste pole = produkt niewidoczny dla klientów.
 */
export function SslPricesForm({ dane }: { dane: { produkty: SslProduktAdminDto[] } | { blad: string } }) {
  const [state, action, pending] = useActionState(updateSslPricesAction, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl">
      <legend className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <ShieldCheck className="h-4 w-4" /> Certyfikaty SSL płatne (DV)
      </legend>
      {'blad' in dane ? (
        <p className="text-sm text-rose-300">{dane.blad}</p>
      ) : dane.produkty.length === 0 ? (
        <p className="text-sm text-neutral-400">Rejestrator nie zwrócił żadnego certyfikatu DV (pojedyncza domena / wildcard).</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="pb-2">Produkt</th>
              <th className="pb-2">Koszt / rok</th>
              <th className="pb-2">Sugestia brutto</th>
              <th className="pb-2">Cena brutto za rok (K)</th>
            </tr>
          </thead>
          <tbody>
            {dane.produkty.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="py-2 text-white">
                  {p.name} <span className="text-neutral-500">{p.brand}{p.wildcard ? ' · wildcard' : ''}</span>
                </td>
                <td className="py-2 text-neutral-300">{p.costAmount ? `${kwota(p.costAmount)} ${p.costCurrency}` : '—'}</td>
                <td className="py-2 text-neutral-300">{p.suggestedGross ? `${kwota(p.suggestedGross)} K` : '—'}</td>
                <td className="py-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`ssl-${p.id}`}
                    defaultValue={p.price ?? ''}
                    placeholder="niedostępny"
                    aria-label={`Cena brutto ${p.name}`}
                    className="w-32 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-400/60"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-neutral-500">
        Klient płaci z portfela; przy odrzuceniu zamówienia opłata wraca automatycznie. OV/EV klient zamawia przez zgłoszenie.
      </p>
      {'blad' in dane ? null : (
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Zapisz cennik
          </button>
          {state.ok ? <span className="text-xs text-emerald-300">Zapisano.</span> : null}
          {state.error ? <span className="text-xs text-rose-300">{state.error}</span> : null}
        </div>
      )}
    </form>
  );
}

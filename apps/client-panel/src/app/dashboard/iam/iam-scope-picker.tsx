'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/panel/checkbox';

/**
 * PB-20 — zakres dostępu: całe konto albo wybrane usługi. Przy „wybranych” osoba widzi tylko te usługi;
 * portfel, domeny, zamówienia i IAM całego konta są wtedy dla niej zamknięte (odmowa w API).
 */
export function IamScopePicker({
  services,
  defaultSelected = [],
}: {
  services: { id: string; name: string }[];
  defaultSelected?: string[];
}) {
  const [wybrane, setWybrane] = useState(defaultSelected.length > 0);
  const [ids, setIds] = useState(new Set(defaultSelected));
  const przelacz = (id: string) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const seg = (aktywny: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-medium transition ${aktywny ? 'bg-white text-black' : 'text-neutral-300 hover:bg-white/10'}`;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-neutral-200">Zakres dostępu</p>
      <div className="inline-flex rounded-xl border border-white/10 p-1" role="group" aria-label="Zakres dostępu">
        <button type="button" aria-pressed={!wybrane} className={seg(!wybrane)} onClick={() => setWybrane(false)}>
          Całe konto
        </button>
        <button type="button" aria-pressed={wybrane} className={seg(wybrane)} onClick={() => setWybrane(true)} disabled={services.length === 0}>
          Wybrane usługi
        </button>
      </div>
      <input type="hidden" name="zakres" value={wybrane ? 'wybrane' : 'caly'} />
      {wybrane ? (
        <div className="grid gap-2 md:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-neutral-300">
              <Checkbox name="serviceIds" value={s.id} checked={ids.has(s.id)} onChange={() => przelacz(s.id)} className="h-4 w-4" />
              <span className="break-all">{s.name}</span>
            </label>
          ))}
          {ids.size === 0 ? <p className="text-xs text-amber-400/90 md:col-span-2">Zaznacz co najmniej jedną usługę.</p> : null}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Osoba zobaczy wszystkie usługi konta — w granicach zaznaczonych uprawnień.</p>
      )}
      {wybrane ? (
        <p className="text-xs text-neutral-500">Przy wybranych usługach portfel, domeny, zamówienia i ustawienia całego konta są dla tej osoby zamknięte.</p>
      ) : null}
    </div>
  );
}

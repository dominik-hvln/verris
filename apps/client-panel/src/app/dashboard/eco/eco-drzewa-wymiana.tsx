'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@verris/ui';
import { Select } from '@/components/panel';
import { potwierdz } from '@/components/panel/potwierdz';
import { plForm } from '@/lib/pl';
import { wymienNaDrzewoAction } from './eco-actions';
import { punktyZaProcent } from './drzewa-format';

const PROCENTY = [1, 5, 10, 25, 50, 100];

/** Wymiana punktów EKO: procent drzewa do wspólnej puli albo własne drzewo (pełne 100%) z certyfikatem. */
export function EcoDrzewaWymiana({
  punkty,
  punktyNaDrzewo,
  maksWlasnychNaRaz,
}: {
  punkty: number;
  punktyNaDrzewo: number;
  maksWlasnychNaRaz: number;
}) {
  const id = useId();
  const [cel, setCel] = useState<'PULA' | 'WLASNE'>('PULA');
  const [procent, setProcent] = useState(PROCENTY[0]);
  const [drzewa, setDrzewa] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const opcjeProcent = useMemo(
    () =>
      PROCENTY.map((p) => {
        const koszt = punktyZaProcent(p, punktyNaDrzewo);
        return { value: String(p), label: `${p}% drzewa — ${koszt} pkt`, disabled: koszt > punkty };
      }),
    [punkty, punktyNaDrzewo],
  );
  const maksDrzew = Math.min(maksWlasnychNaRaz, Math.floor(punkty / punktyNaDrzewo));
  const opcjeDrzewa = Array.from({ length: Math.max(1, maksDrzew) }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: `${n} ${plForm(n, 'drzewo', 'drzewa', 'drzew')} — ${n * punktyNaDrzewo} pkt`,
    disabled: n * punktyNaDrzewo > punkty,
  }));
  const koszt = cel === 'PULA' ? punktyZaProcent(procent, punktyNaDrzewo) : drzewa * punktyNaDrzewo;
  const mozna = koszt <= punkty && koszt > 0;

  const wymien = async () => {
    const opis =
      cel === 'PULA'
        ? `Wymienić ${koszt} pkt na ${procent}% drzewa we wspólnej puli? Drzewo zbiorcze zamawiamy, gdy pula uzbiera 100%.`
        : `Wymienić ${koszt} pkt na ${drzewa} ${plForm(drzewa, 'własne drzewo', 'własne drzewa', 'własnych drzew')}? Certyfikat (wystawiony na Verris, z tekstem „Drzewo posadzone dzięki klientom Verris”) pojawi się tutaj, gdy partner potwierdzi posadzenie.`;
    if (!(await potwierdz(opis, { akcja: 'Wymień', tytul: 'Wymiana punktów' }))) return;
    setBusy(true);
    setMsg(null);
    const r = await wymienNaDrzewoAction(cel === 'PULA' ? { cel, procent } : { cel, drzewa });
    setBusy(false);
    setMsg('error' in r ? { ok: false, text: r.error } : { ok: true, text: `Gotowe — wymieniono ${r.punktyWydane} pkt.` });
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Na co wymieniasz punkty" className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
        {(
          [
            ['PULA', 'Procent drzewa do wspólnej puli'],
            ['WLASNE', 'Własne drzewo z certyfikatem'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={cel === v}
            onClick={() => setCel(v)}
            className={`rounded-lg px-3 py-2 text-sm ${cel === v ? 'bg-emerald-600 text-white' : 'text-neutral-300 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 space-y-1 lg:max-w-md">
          <label htmlFor={id} className="text-xs text-neutral-400">
            {cel === 'PULA' ? 'Ile procent drzewa' : 'Ile drzew'}
          </label>
          {cel === 'PULA' ? (
            <Select id={id} value={String(procent)} onChange={(v) => setProcent(Number(v))} options={opcjeProcent} disabled={busy} />
          ) : (
            <Select
              id={id}
              value={String(drzewa)}
              onChange={(v) => setDrzewa(Number(v))}
              options={opcjeDrzewa}
              disabled={busy || maksDrzew < 1}
            />
          )}
          {cel === 'WLASNE' && maksDrzew < 1 ? (
            <p className="text-xs text-neutral-500">
              Własne drzewo to {punktyNaDrzewo} pkt — brakuje Ci {Math.max(0, punktyNaDrzewo - punkty)} pkt.
            </p>
          ) : null}
        </div>
        <Button type="button" disabled={busy || !mozna} onClick={wymien} className="bg-emerald-700 text-white hover:bg-emerald-600">
          Wymień {koszt} pkt
        </Button>
      </div>
      {msg ? <p className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
    </div>
  );
}

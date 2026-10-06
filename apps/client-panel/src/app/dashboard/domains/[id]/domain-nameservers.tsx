'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { potwierdz } from '@/components/panel/potwierdz';
import { serweryNazwAction } from '../actions';

const przycisk = 'rounded-lg border border-white/15 px-3 py-1.5 text-white hover:bg-white/10 disabled:opacity-50';
const takieSame = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Serwery nazw domeny kupionej przez Verris. t1 07.10: domena z 04.10 została na ns1/ns2.verris.pl
 * (nieistniejące), a panel nie miał jak tego zmienić.
 */
export function DomainNameservers({ domainId, nameservers, defaults }: { domainId: string; nameservers: string[]; defaults: string[] }) {
  const router = useRouter();
  const poleId = useId();
  const [obecne, setObecne] = useState(nameservers);
  const [edycja, setEdycja] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const naVerris = defaults.length > 0 && takieSame(obecne, defaults);

  const zapisz = async () => {
    const lista = (edycja ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (lista.length < 2) return toast.error('Podaj co najmniej 2 serwery nazw');
    const ok = await potwierdz(
      `Nowe serwery: ${lista.join(', ')}. Zmiana rozchodzi się w internecie do 24–48 godzin — w tym czasie strona i poczta mogą działać z przerwami.`,
      { tytul: 'Zmienić serwery nazw?', akcja: 'Zmień serwery' },
    );
    if (!ok) return;
    setBusy(true);
    const r = await serweryNazwAction(domainId, lista);
    setBusy(false);
    if (!r.ok) return toast.error('Nie udało się zmienić serwerów nazw', { description: r.error });
    setObecne(r.nameservers);
    setEdycja(null);
    toast.success('Serwery nazw zmienione u rejestratora');
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-6 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Serwery nazw</h2>
          <p className="mt-1 font-mono text-neutral-300">{obecne.length ? obecne.join(', ') : 'nie ustawiono'}</p>
        </div>
        {edycja === null ? (
          <button type="button" onClick={() => setEdycja(obecne.join('\n'))} disabled={busy} className={przycisk}>
            Zmień
          </button>
        ) : null}
      </div>
      {defaults.length && !naVerris ? (
        <p className="text-amber-200">
          Domena nie wskazuje na serwery Verris ({defaults.join(', ')}). Strona i poczta w Verris zadziałają po ich ustawieniu.
        </p>
      ) : null}
      {edycja !== null ? (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <label htmlFor={poleId} className="block text-neutral-400">Serwery nazw — jeden w wierszu (od 2 do 8)</label>
          <textarea
            id={poleId}
            value={edycja}
            onChange={(e) => setEdycja(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-white"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={zapisz} disabled={busy} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-black hover:bg-neutral-200 disabled:opacity-50">
              Zapisz serwery
            </button>
            {defaults.length ? (
              <button type="button" onClick={() => setEdycja(defaults.join('\n'))} disabled={busy} className={przycisk}>
                Wstaw serwery Verris
              </button>
            ) : null}
            <button type="button" onClick={() => setEdycja(null)} disabled={busy} className={przycisk}>
              Anuluj
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

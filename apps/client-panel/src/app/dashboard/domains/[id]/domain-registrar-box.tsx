'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  abonentDomenyAction, blokadaTransferuAction, kodTransferuAction, zapiszAbonentaAction, type Abonent,
} from '../actions';
import { RegistrantFields, brakiAbonenta } from '../components/registrant-fields';

const przycisk = 'rounded-lg border border-white/15 px-3 py-1.5 text-white hover:bg-white/10 disabled:opacity-50';

/**
 * A-15 blokada transferu · A-09 kod transferu · A-13 dane abonenta.
 * Tylko domeny kupione przez Verris (u innego rejestratora klient robi to tam).
 */
export function DomainRegistrarBox({ domainId, transferLock }: { domainId: string; transferLock: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [lock, setLock] = useState(transferLock);
  const [kod, setKod] = useState<string | null>(null);
  const [abonent, setAbonent] = useState<Abonent | null>(null);

  const przelacz = async () => {
    setBusy(true);
    const r = await blokadaTransferuAction(domainId, !lock);
    setBusy(false);
    if (!r.ok) return toast.error('Nie udało się zmienić blokady', { description: r.error });
    setLock(!lock);
    toast.success(!lock ? 'Transfer zablokowany' : 'Transfer odblokowany');
    router.refresh();
  };

  const pokazKod = async () => {
    setBusy(true);
    const r = await kodTransferuAction(domainId);
    setBusy(false);
    if (!r.ok) return toast.error('Nie udało się pobrać kodu', { description: r.error });
    setKod(r.authCode);
  };

  const wczytajAbonenta = async () => {
    setBusy(true);
    const r = await abonentDomenyAction(domainId);
    setBusy(false);
    if (!r.ok) return toast.error('Nie udało się pobrać danych abonenta', { description: r.error });
    setAbonent(r.abonent);
  };

  const zapisz = async () => {
    if (!abonent) return;
    const braki = brakiAbonenta(abonent);
    if (braki.length) return toast.error('Uzupełnij dane abonenta', { description: braki.join(', ') });
    setBusy(true);
    const r = await zapiszAbonentaAction(domainId, abonent);
    setBusy(false);
    if (!r.ok) return toast.error('Nie udało się zapisać', { description: r.error });
    setAbonent(r.abonent);
    toast.success('Dane abonenta zapisane u rejestratora');
  };

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-black/30 p-6 text-sm">
      <div>
        <h2 className="text-lg font-semibold text-white">Transfer i abonent</h2>
        <p className="mt-1 text-neutral-400">
          Domena jest zarejestrowana na Ciebie. Możesz ją w każdej chwili przenieść do innego rejestratora.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-white">Blokada transferu: {lock ? 'włączona' : 'wyłączona'}</p>
          <p className="text-neutral-500">
            {lock ? 'Nikt nie przeniesie domeny do innego rejestratora.' : 'Domenę można przenieść, mając kod transferu.'}
          </p>
        </div>
        <button type="button" onClick={przelacz} disabled={busy} className={przycisk}>
          {lock ? 'Odblokuj transfer' : 'Zablokuj transfer'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-white">Kod transferu (AuthInfo / EPP)</p>
          <p className="text-neutral-500">Podajesz go nowemu rejestratorowi. Każde wyświetlenie zapisujemy w dzienniku konta.</p>
        </div>
        {kod ? (
          <code className="break-all rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-white">{kod}</code>
        ) : (
          <button type="button" onClick={pokazKod} disabled={busy} className={przycisk}>
            Pokaż kod
          </button>
        )}
      </div>
      {kod && lock ? <p className="text-amber-200">Przed transferem odblokuj domenę — z blokadą nowy rejestrator jej nie przejmie.</p> : null}

      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-white">Dane abonenta (właściciela)</p>
          {abonent ? null : (
            <button type="button" onClick={wczytajAbonenta} disabled={busy} className={przycisk}>
              Pokaż i edytuj
            </button>
          )}
        </div>
        {abonent ? (
          <>
            <RegistrantFields value={abonent} onChange={setAbonent} nazwaZablokowana />
            <button type="button" onClick={zapisz} disabled={busy} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-black hover:bg-neutral-200 disabled:opacity-50">
              Zapisz dane abonenta
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

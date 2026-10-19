'use client';

/**
 * 19.10 — powrót z płatności kartą (Stripe Checkout, `?platnosc=karta`). Płatność jest przyjęta, ale usługa ruszy
 * dopiero po webhooku Stripe i założeniu konta — baner sprawdza stan co kilka sekund i po aktywacji odświeża stronę.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { stanUslugiPoPlatnosciAction } from '@/app/dashboard/services/subscription-payment-actions';

export const ODSTEP_SPRAWDZANIA_MS = 4000;
/** Po tylu próbach (ok. 3 min) baner przestaje pytać i zostawia klientowi zwykłe odświeżenie. */
export const LIMIT_PROB = 45;

export type EtapPlatnosci = 'czekamy' | 'gotowe' | 'dlugo';

/** Etap banera z bieżącego statusu usługi i liczby wykonanych sprawdzeń. */
export function etapPlatnosci(status: string | null, proby: number): EtapPlatnosci {
  if (status === 'ACTIVE') return 'gotowe';
  return proby >= LIMIT_PROB ? 'dlugo' : 'czekamy';
}

export function PlatnoscKartaBaner({ serviceId, onGotowe }: { serviceId: string; onGotowe: () => void }) {
  const [etap, setEtap] = useState<EtapPlatnosci>('czekamy');

  useEffect(() => {
    let proby = 0;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sprawdz = async () => {
      const r = await stanUslugiPoPlatnosciAction(serviceId);
      if (stop) return;
      proby += 1;
      const nowy = etapPlatnosci(r.ok ? (r.data?.status ?? null) : null, proby);
      setEtap(nowy);
      if (nowy === 'gotowe') onGotowe();
      else if (nowy === 'czekamy') timer = setTimeout(sprawdz, ODSTEP_SPRAWDZANIA_MS);
    };
    void sprawdz();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  if (etap === 'gotowe') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p>Płatność przyjęta, usługa działa.</p>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-4 text-sm">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-300" />
      <div>
        <p className="font-semibold">Płatność przyjęta — uruchamiamy usługę.</p>
        <p className="text-muted-foreground">
          {etap === 'dlugo'
            ? 'To trwa dłużej niż zwykle. Odśwież stronę za kilka minut — jeśli usługa dalej nie działa, napisz do pomocy.'
            : 'Zwykle trwa to do minuty. Strona odświeży się sama.'}
        </p>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { pobierzPodgladAction, type PodgladStrony } from '@/app/dashboard/services/[id]/podglad-actions';

/**
 * 15.10 — „Zobacz stronę przed zmianą DNS”: tymczasowy adres podglądu (white label, bez adresu serwera). Pokazujemy
 * go tylko, gdy domena jeszcze nie wskazuje na nas, a API ma włączony podgląd; inaczej komponent nic nie renderuje.
 */
export function PodgladPrzedDns({ serviceId }: { serviceId: string }) {
  const [p, setP] = useState<PodgladStrony | null>(null);

  useEffect(() => {
    let zywy = true;
    void pobierzPodgladAction(serviceId).then((r) => {
      if (zywy) setP(r);
    });
    return () => {
      zywy = false;
    };
  }, [serviceId]);

  if (!p) return null;
  const wygasa = new Date(p.wygasa).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
  return (
    <div className="rounded-lg border border-line-strong bg-raised px-3 py-2.5 text-xs">
      <p className="font-medium text-foreground">Zobacz stronę na nowym serwerze, zanim przełączysz domenę</p>
      <p className="mt-0.5 text-muted-foreground">
        Tymczasowy adres pokazuje {p.domena} tak, jak będzie działać u nas. Służy do oglądania — logowanie do panelu strony
        i formularze zadziałają po zmianie DNS. Adres ważny do {wygasa}.
      </p>
      <a
        href={p.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-data-hi underline underline-offset-2"
      >
        Otwórz podgląd strony <ExternalLink aria-hidden className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

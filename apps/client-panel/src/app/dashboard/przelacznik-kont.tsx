'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRight, Check, ChevronDown, Loader2 } from 'lucide-react';
import { pobierzKontaAction, przelaczKontoAction, type KontoDoPrzelaczenia } from './konta-actions';

type Dzialanie = { ownerUserId: string; nazwa: string; email: string } | null | undefined;

async function przelacz(ownerUserId: string | null) {
  const r = await przelaczKontoAction(ownerUserId);
  if (!r.ok) {
    toast.error(r.error);
    return;
  }
  // Pełne przeładowanie: menu, liczniki i dane stron muszą przyjść już z nowego konta.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- celowo pełne przeładowanie (nowy token, czysty stan klienta)
  window.location.assign('/dashboard');
}

/**
 * PB-20 — przełącznik kont w menu bocznym: „Moje konto” + konta, które inni mi udostępnili.
 * Niewidoczny, gdy nie ma dokąd się przełączyć.
 */
export function PrzelacznikKont({ actingFor }: { actingFor: Dzialanie }) {
  const [konta, setKonta] = useState<KontoDoPrzelaczenia[]>([]);
  const [otwarty, setOtwarty] = useState(false);
  const [zajety, setZajety] = useState<string | null>(null);

  useEffect(() => {
    void pobierzKontaAction().then(setKonta);
  }, []);

  if (konta.length === 0 && !actingFor) return null;
  const biezace = actingFor?.ownerUserId ?? null;
  const wybierz = async (id: string | null) => {
    if (id === biezace) return setOtwarty(false);
    setZajety(id ?? 'moje');
    await przelacz(id);
    setZajety(null);
  };
  const pozycja = (id: string | null, tytul: string, opis: string) => (
    <li key={id ?? 'moje'}>
      <button
        type="button"
        onClick={() => void wybierz(id)}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-sidebar-accent"
        aria-current={id === biezace ? 'true' : undefined}
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[13px] font-medium text-sidebar-foreground">{tytul}</span>
          <span className="block break-all text-[11px] text-muted-foreground">{opis}</span>
        </span>
        {zajety === (id ?? 'moje') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : id === biezace ? <Check className="h-3.5 w-3.5 text-data" /> : null}
      </button>
    </li>
  );

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOtwarty((v) => !v)}
        aria-expanded={otwarty}
        className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-2.5 py-2 text-left text-[12.5px] text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 break-words">{actingFor ? actingFor.nazwa : 'Moje konto'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${otwarty ? 'rotate-180' : ''}`} />
      </button>
      {otwarty ? (
        <ul className="mt-1 space-y-0.5 rounded-lg border border-sidebar-border bg-sidebar p-1">
          {pozycja(null, 'Moje konto', 'Twoje usługi i płatności')}
          {konta.map((k) =>
            pozycja(k.ownerUserId, k.etykieta ? `${k.nazwa} · ${k.etykieta}` : k.nazwa, k.wybraneUslugi ? `${k.email} · wybrane usługi (${k.wybraneUslugi})` : `${k.email} · całe konto`),
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** PB-20 — pasek nad treścią, gdy pracuję na cudzym koncie: czyje to konto i jak wrócić. */
export function PasekCudzegoKonta({ actingFor, zakres }: { actingFor: Dzialanie; zakres: number }) {
  const [zajety, setZajety] = useState(false);
  if (!actingFor) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-data/30 bg-data-soft px-4 py-2.5 text-sm text-foreground">
      <span>
        Pracujesz na koncie <b>{actingFor.nazwa}</b> ({actingFor.email}){zakres ? ` · dostęp do wybranych usług (${zakres})` : ''}.
        Twoje działania widzi właściciel konta.
      </span>
      <button
        type="button"
        disabled={zajety}
        onClick={() => {
          setZajety(true);
          void przelacz(null).finally(() => setZajety(false));
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs hover:bg-raised disabled:opacity-50"
      >
        {zajety ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />} Wróć do swojego konta
      </button>
    </div>
  );
}

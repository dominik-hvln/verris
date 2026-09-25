'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionHead } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import { fetchDnssec, wlaczDnssec, wylaczDnssec, type DnssecStan } from '@/app/dashboard/services/[id]/dnssec-actions';

const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';

/**
 * F-06 — DNSSEC domeny. Włączenie podpisuje strefę; żeby zadziałało w internecie, rekordy DS trzeba
 * wpisać u rejestratora domeny. Wyłączenie najpierw u rejestratora (usuń DS), potem tutaj — inaczej
 * domena przestanie się rozwiązywać w resolverach sprawdzających podpisy.
 */
export function DnssecPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<DnssecStan | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void fetchDnssec(serviceId, domain).then((r) => (r.ok ? (setStan(r.stan), setBlad(null)) : setBlad(r.error)));
  }, [serviceId, domain]);

  const wlacz = async () => {
    const ok = await potwierdz(
      `Podpisać strefę ${domain} (DNSSEC)? Po włączeniu dostaniesz rekordy DS do wpisania u rejestratora domeny — dopiero wtedy ochrona działa w internecie.`,
      { akcja: 'Włącz DNSSEC' },
    );
    if (!ok) return;
    start(async () => {
      const r = await wlaczDnssec(serviceId, domain);
      if (r.ok) {
        setStan(r.stan);
        toast.success('Strefa podpisana. Skopiuj rekordy DS do rejestratora domeny.');
      } else toast.error(r.error);
    });
  };

  const wylacz = async () => {
    const ok = await potwierdz(
      `Wyłączyć DNSSEC dla ${domain}? Najpierw usuń rekordy DS u rejestratora i odczekaj dobę — jeśli DS zostaną, domena przestanie działać w części sieci.`,
      { akcja: 'Wyłącz DNSSEC', niebezpieczne: true },
    );
    if (!ok) return;
    start(async () => {
      const r = await wylaczDnssec(serviceId, domain);
      if (r.ok) {
        setStan(r.stan);
        toast.success('DNSSEC wyłączony — strefa bez podpisu.');
      } else toast.error(r.error);
    });
  };

  const kopiuj = async (tekst: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
      toast.success('Skopiowano rekordy DS.');
    } catch {
      toast.error('Nie udało się skopiować — zaznacz tekst ręcznie.');
    }
  };

  return (
    <section className="mt-8">
      <SectionHead
        title="DNSSEC"
        desc="Podpis strefy chroni przed podszyciem się pod Twoją domenę w DNS. Działa po wpisaniu rekordów DS u rejestratora."
      />
      {blad ? <p role="alert" className="m-0 my-2 rounded-[8px] border border-line px-3 py-2 text-[13px] text-crit">Nie udało się wczytać: {blad}</p> : null}
      <div className="rounded-[10px] border border-line bg-card px-4 py-3">
        {stan === null ? (
          <p className="m-0 text-[13px] text-muted-foreground">{blad ? 'Brak odczytu z serwera.' : 'Wczytywanie…'}</p>
        ) : (
          <>
            <p className="m-0 text-[13.5px] text-foreground">
              {stan.podpisana ? (
                <>Strefa jest podpisana{stan.podpisanaOd ? ` (od ${stan.podpisanaOd})` : ''}. Serwer odnawia podpis automatycznie.</>
              ) : (
                'Strefa nie jest podpisana.'
              )}
            </p>
            {stan.blad && !stan.podpisana ? <p className="m-0 mt-1 text-[12.5px] text-warn">Serwer: {stan.blad}</p> : null}
            {stan.podpisana && stan.ds.length ? (
              <div className="mt-3">
                <p className="m-0 mb-1 text-[13px] font-medium text-foreground">Rekordy DS do wpisania u rejestratora</p>
                <pre className="m-0 whitespace-pre-wrap break-all rounded-[7px] border border-line bg-background px-3 py-2 font-mono text-[12.5px] text-foreground">
                  {stan.ds.join('\n')}
                </pre>
                <button type="button" onClick={() => void kopiuj(stan.ds.join('\n'))} className={`${BTN} mt-2`}>
                  Kopiuj rekordy DS
                </button>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {stan.podpisana ? (
                <button type="button" onClick={() => void wylacz()} disabled={pending} className={BTN}>
                  Wyłącz DNSSEC
                </button>
              ) : (
                <button type="button" onClick={() => void wlacz()} disabled={pending} className={BTN}>
                  Włącz DNSSEC
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

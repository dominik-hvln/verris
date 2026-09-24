'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { StatusPill } from '@/components/panel/v2';
import { checkAllWp, fetchWpOverview, type WpPrzeglad } from '@/app/dashboard/services/[id]/hosting-wp-update-actions';

const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const data = (iso: string) => new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * I-14 — wszystkie strony WordPress konta na jednym ekranie: wersja, czekające aktualizacje,
 * automat i punkty zabezpieczeń do poprawy. Szczegóły i akcje — w zakładce WordPress każdej strony.
 */
export function WpOverviewPanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<WpPrzeglad | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchWpOverview(serviceId).then((r) => {
        if (r.ok) {
          setStan(r.data);
          setBlad(null);
        } else setBlad(r.error);
      }),
    [serviceId],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  const wToku = !!stan?.strony.some((s) => s.wToku);
  useEffect(() => {
    if (!wToku) return;
    const t = setInterval(() => void odswiez(), 8_000);
    return () => clearInterval(t);
  }, [wToku, odswiez]);

  const sprawdzWszystkie = () =>
    start(async () => {
      const r = await checkAllWp(serviceId);
      if (r.ok) {
        setStan(r.data);
        toast.success('Sprawdzanie wszystkich stron zlecone — wyniki pojawią się po kolei.');
      } else toast.error(r.error);
    });

  return (
    <div className="rounded-[10px] border border-line bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h3 className="m-0 text-[15px] font-bold text-foreground">Wszystkie strony WordPress</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">Stan z ostatniego sprawdzenia każdej domeny. Aktualizacje i poprawki — w zakładce WordPress strony.</p>
        </div>
        <button type="button" onClick={sprawdzWszystkie} disabled={pending || !stan || wToku} className={BTN}>
          {wToku ? 'Sprawdzam…' : 'Sprawdź wszystkie'}
        </button>
      </header>
      {blad ? <p role="alert" className="m-0 px-4 py-3 text-[13px] text-crit">Nie udało się wczytać: {blad}</p> : null}
      {stan && !stan.strony.length ? <p className="m-0 px-4 py-3 text-[13px] text-muted-foreground">Konto nie ma jeszcze domen.</p> : null}
      {stan?.strony.length ? (
        <ul className="m-0 list-none p-0 text-[13px]">
          {stan.strony.map((s) => (
            <li key={s.domena} className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 first:border-t-0">
              <div className="min-w-0">
                <Link href={`/dashboard/services/${serviceId}/sites/${encodeURIComponent(s.domena)}?tab=wordpress`} className="font-semibold text-foreground hover:underline">
                  {s.domena}
                </Link>
                <span className="ml-2 text-[12px] text-muted-foreground">
                  {s.wToku
                    ? 'sprawdzanie w toku…'
                    : s.brakWordpressa
                      ? 'bez WordPressa'
                      : s.wersja
                        ? `WordPress ${s.wersja}${s.sprawdzono ? ` · ${data(s.sprawdzono)}` : ''}`
                        : 'jeszcze nie sprawdzono'}
                </span>
              </div>
              {s.wersja && !s.brakWordpressa ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.rdzen ? <StatusPill tone="warn">rdzeń → {s.rdzen}</StatusPill> : null}
                  {s.wtyczki ? <StatusPill tone="warn">wtyczki: {s.wtyczki}</StatusPill> : null}
                  {s.motywy ? <StatusPill tone="warn">motywy: {s.motywy}</StatusPill> : null}
                  {!s.rdzen && !s.wtyczki && !s.motywy ? <StatusPill tone="data">aktualny</StatusPill> : null}
                  {s.doPoprawy ? <StatusPill tone="warn">zabezpieczenia: {s.doPoprawy} do poprawy</StatusPill> : null}
                  {s.konserwacja ? <StatusPill tone="warn">tryb konserwacji</StatusPill> : null}
                  <StatusPill tone={s.automat ? 'data' : 'muted'}>{s.automat ? 'automat włączony' : 'automat wyłączony'}</StatusPill>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

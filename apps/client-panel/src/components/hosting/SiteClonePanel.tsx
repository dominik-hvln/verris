'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionHead, StatusPill } from '@/components/panel/v2';
import { Select } from '@/components/panel/select';
import { potwierdz } from '@/components/panel/potwierdz';
import { fetchSiteClone, runSiteClone, type SiteCloneStatus } from '@/app/dashboard/services/[id]/hosting-site-clone-actions';

/**
 * I-13 — kopia tej strony na inną domenę konta (np. nowa wersja pod inną domeną, kopia robocza).
 * WordPress dostaje nową bazę i adresy nowej domeny. Pliki domeny docelowej odkładamy obok.
 */
export function SiteClonePanel({ serviceId, domain, domains }: { serviceId: string; domain: string; domains: string[] }) {
  const cele = domains.filter((d) => d !== domain);
  const [cel, setCel] = useState('');
  const [stan, setStan] = useState<SiteCloneStatus | null>(null);
  const [pending, start] = useTransition();
  const c = cel || cele[0] || '';

  const odswiez = useCallback(
    () =>
      fetchSiteClone(serviceId).then((r) => {
        if (r.ok) setStan(r.status);
      }),
    [serviceId],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 8_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const klonuj = async () => {
    const ok = await potwierdz(
      `Skopiować ${domain} na ${c}? Obecne pliki ${c} przeniesiemy obok (nic nie usuwamy). WordPress dostanie nową bazę i adresy ${c}. Jeśli to WordPress, najpierw kliknij „Sprawdź aktualizacje” w zakładce WordPress tej strony.`,
      { akcja: 'Skopiuj' },
    );
    if (!ok) return;
    start(async () => {
      const r = await runSiteClone(serviceId, domain, c);
      if (r.ok) {
        setStan(r.status);
        toast.success('Kopiowanie zlecone — potrwa kilka minut.');
      } else toast.error(r.error);
    });
  };

  if (!cele.length) return null;

  return (
    <section className="mt-8">
      <SectionHead title="Kopia strony na inną domenę" desc="Pliki i — dla WordPressa — baza z adresami zmienionymi na nową domenę." />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select aria-label="Domena docelowa" value={c} onChange={setCel} options={cele.map((d) => ({ value: d, label: d }))} className="w-full sm:w-72" />
        <button
          type="button"
          onClick={() => void klonuj()}
          disabled={pending || !stan || stan.wToku}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50"
        >
          {stan?.wToku ? 'Kopiuję…' : `Skopiuj na ${c}`}
        </button>
      </div>
      {stan?.kopie.length ? (
        <ul className="m-0 mt-3 list-none rounded-[10px] border border-line bg-card p-0 text-[13px]">
          {stan.kopie.map((k) => (
            <li key={k.id} className="border-t border-line px-4 py-2 first:border-t-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={k.status === 'COMPLETED' ? 'data' : k.status === 'FAILED' ? 'warn' : 'muted'}>
                  {k.status === 'COMPLETED' ? 'gotowe' : k.status === 'FAILED' ? 'błąd' : 'w toku'}
                </StatusPill>
                <span className="text-foreground">
                  {k.zrodlo} → {k.cel}
                </span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {new Date(k.utworzone).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {k.wordpress && k.nowaBaza ? <p className="m-0 mt-1 text-[12px] text-muted-foreground">WordPress z nową bazą <span className="font-mono">{k.nowaBaza}</span>.</p> : null}
              {k.poprzedniePliki ? <p className="m-0 mt-1 text-[12px] text-muted-foreground">Poprzednie pliki: <span className="font-mono">~/{k.poprzedniePliki}</span></p> : null}
              {k.blad ? <p className="m-0 mt-1 text-[12px] text-crit">{k.blad}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

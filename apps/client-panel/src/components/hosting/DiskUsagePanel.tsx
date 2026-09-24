'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHead } from '@/components/panel/v2';
import { countDiskUsage, fetchDiskUsage, type DiskUsageStatus } from '@/app/dashboard/services/[id]/hosting-disk-usage-actions';

/**
 * C-15/K-03 — co zajmuje miejsce i ile jest plików, dwa poziomy katalogów od katalogu domowego.
 * Serwer liczy na żądanie (ok. minuty); pokazujemy ostatni pomiar z datą.
 */
const OPISY: Record<string, string> = {
  domains: 'pliki stron',
  imap: 'poczta',
  Maildir: 'poczta',
  backups: 'kopie zapasowe',
  'verris-bazy': 'eksporty baz',
  'verris-odtworzone': 'odtworzone z kopii',
  '.trash': 'kosz menedżera plików',
  tmp: 'pliki tymczasowe',
  '.cache': 'pamięć podręczna narzędzi',
};

function rozmiar(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} GB`;
  if (kb >= 1024) return `${(kb / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB`;
  return `${kb} kB`;
}

export function DiskUsagePanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<DiskUsageStatus | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchDiskUsage(serviceId).then((r) => {
        if (r.ok) setStan(r.status);
        else toast.error(r.error);
      }),
    [serviceId],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 6_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const policz = () =>
    start(async () => {
      const r = await countDiskUsage(serviceId);
      if (r.ok) setStan(r.status);
      else toast.error(r.error);
    });

  const max = Math.max(1, ...(stan?.wpisy ?? []).map((w) => w.kb));
  // Najpierw katalogi pierwszego poziomu, pod każdym jego podkatalogi — jak drzewo.
  const pierwsze = (stan?.wpisy ?? []).filter((w) => !w.sciezka.includes('/'));
  const dzieci = (p: string) => (stan?.wpisy ?? []).filter((w) => w.sciezka.startsWith(`${p}/`));

  return (
    <section>
      <SectionHead
        title="Co zajmuje miejsce"
        desc={
          stan?.policzono
            ? `Pomiar z ${new Date(stan.policzono).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${stan.razem ? ` · razem ${rozmiar(stan.razem.kb)}${stan.razem.pliki !== null ? `, ${stan.razem.pliki.toLocaleString('pl-PL')} plików` : ''}` : ''}.`
            : 'Serwer policzy rozmiar i liczbę plików w katalogach konta — potrwa to około minuty.'
        }
        action={
          <button
            type="button"
            onClick={policz}
            disabled={pending || !stan || stan.wToku}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50"
          >
            {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {stan?.wToku ? 'Liczę…' : stan?.policzono ? 'Policz ponownie' : 'Policz'}
          </button>
        }
      />
      {stan?.blad ? <p className="mb-2 text-[13px] text-crit">{stan.blad}</p> : null}
      {pierwsze.length ? (
        <ul className="m-0 list-none overflow-hidden rounded-[10px] border border-line bg-card p-0">
          {pierwsze.map((w) => (
            <li key={w.sciezka} className="border-t border-line first:border-t-0">
              <Wiersz w={w} max={max} />
              {dzieci(w.sciezka).length ? (
                <ul className="m-0 list-none p-0 pl-5">
                  {dzieci(w.sciezka).slice(0, 8).map((d) => (
                    <li key={d.sciezka} className="border-t border-line/60">
                      <Wiersz w={d} max={max} nazwa={d.sciezka.slice(w.sciezka.length + 1)} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {pierwsze.length ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Duże pozycje to zwykle poczta, stare kopie w katalogu backups i pliki tymczasowe. Pliki usuniesz menedżerem plików; na liczbę plików warto uważać przy tysiącach miniatur i pamięci podręcznej wtyczek.
        </p>
      ) : null}
    </section>
  );
}

function Wiersz({ w, max, nazwa }: { w: DiskUsageStatus['wpisy'][number]; max: number; nazwa?: string }) {
  const n = nazwa ?? w.sciezka;
  const opis = OPISY[n] ?? OPISY[n.split('/').pop() ?? ''];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
      <span className="min-w-0 break-all font-mono text-foreground">
        {n}
        {opis ? <span className="ml-2 font-sans text-[12px] text-muted-foreground">{opis}</span> : null}
      </span>
      <span className="whitespace-nowrap text-right tabular-nums text-verris-body">
        {rozmiar(w.kb)}
        {w.pliki !== null ? <span className="ml-2 text-[12px] text-muted-foreground">{w.pliki.toLocaleString('pl-PL')} pl.</span> : null}
      </span>
      <span className="col-span-2 block h-[4px] overflow-hidden rounded-[2px] bg-raised" aria-hidden>
        <span className="block h-full bg-data" style={{ width: `${Math.max(1, Math.round((w.kb / max) * 100))}%` }} />
      </span>
    </div>
  );
}

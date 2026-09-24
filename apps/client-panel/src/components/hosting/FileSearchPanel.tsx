'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHead } from '@/components/panel/v2';
import { fetchFileSearch, runFileSearch, type FileSearchStatus } from '@/app/dashboard/services/[id]/hosting-file-search-actions';

const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const rozmiar = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** C-14 — szukanie plików w katalogu strony po nazwie i/lub tekście w treści. */
export function FileSearchPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<FileSearchStatus | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [tekst, setTekst] = useState('');
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchFileSearch(serviceId, domain).then((r) => {
        if (r.ok) setStan(r.status);
      }),
    [serviceId, domain],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 3_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const szukaj = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await runFileSearch(serviceId, domain, nazwa, tekst);
      if (r.ok) setStan(r.status);
      else toast.error(r.error);
    });
  };

  const w = stan?.wynik ?? null;
  return (
    <section className="mt-8">
      <SectionHead title="Szukaj plików" desc={`W katalogu /domains/${domain}/public_html — po fragmencie nazwy, tekście w treści albo obu naraz.`} />
      <div className="rounded-[10px] border border-line bg-card">
        <form onSubmit={szukaj} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="block min-w-0 text-[13px] font-medium text-foreground">
            Nazwa zawiera
            <input value={nazwa} onChange={(e) => setNazwa(e.target.value)} maxLength={100} placeholder="np. wp-config" className={`mt-1 ${INPUT} font-mono`} />
          </label>
          <label className="block min-w-0 text-[13px] font-medium text-foreground">
            Tekst w pliku
            <input value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={200} placeholder="np. eval(base64_decode" className={`mt-1 ${INPUT} font-mono`} />
          </label>
          <button type="submit" disabled={pending || !stan || stan.wToku || (!nazwa.trim() && !tekst.trim())} className={BTN}>
            <Search className="h-4 w-4" /> {stan?.wToku ? 'Szukam…' : 'Szukaj'}
          </button>
        </form>
        {stan?.blad ? <p className="m-0 border-t border-line px-4 py-2 text-[13px] text-crit">{stan.blad}</p> : null}
        {w && stan?.zapytanie ? (
          <div className="border-t border-line px-4 py-3">
            <p className="m-0 text-[12.5px] text-muted-foreground">
              {[stan.zapytanie.name && `nazwa „${stan.zapytanie.name}”`, stan.zapytanie.text && `tekst „${stan.zapytanie.text}”`].filter(Boolean).join(' i ')}:{' '}
              {w.pliki.length ? `${w.pliki.length}${w.ucieto ? '+' : ''} plików` : 'nic nie znaleziono'}
              {w.ucieto ? ' — pokazujemy pierwsze 500, zawęź wyszukiwanie.' : '.'}
            </p>
            {w.pliki.length ? (
              <ul className="m-0 mt-2 max-h-[420px] list-none overflow-y-auto p-0 text-[12.5px]">
                {w.pliki.map((f) => (
                  <li key={f.p} className="flex flex-wrap justify-between gap-x-3 border-t border-line py-1.5 first:border-t-0">
                    <span className="min-w-0 break-all font-mono text-foreground">{f.p}</span>
                    <span className="font-mono text-muted-foreground">
                      {rozmiar(f.s)} · {new Date(f.t * 1000).toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

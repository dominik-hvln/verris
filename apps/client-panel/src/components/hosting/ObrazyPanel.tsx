'use client';

import { useEffect, useState, useTransition } from 'react';
import { ImageDown, Loader2 } from 'lucide-react';
import { SectionHead, Switch } from '@/components/panel/v2';
import { fetchObrazy, optymalizujObrazy, type StanObrazow } from '@/app/dashboard/services/[id]/hosting-images-actions';

const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB`;

/**
 * J-06 — zmniejsza pliki JPG i PNG strony bez utraty jakości (jpegoptim, optipng). Kolejne uruchomienie
 * bierze tylko nowe pliki, więc można je powtarzać np. po wgraniu zdjęć.
 */
export function ObrazyPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<StanObrazow | null>(null);
  const [katalog, setKatalog] = useState('');
  const [metadane, setMetadane] = useState(true);
  const [blad, setBlad] = useState<string | null>(null);
  const [odczyt, setOdczyt] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    let aktualny = true;
    void fetchObrazy(serviceId, domain).then((r) => {
      if (!aktualny) return;
      if (r.ok) setStan(r.stan);
      else setBlad(r.error);
    });
    return () => {
      aktualny = false;
    };
  }, [serviceId, domain, odczyt]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => setOdczyt((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [stan?.wToku]);

  const o = stan?.ostatni;
  const zysk = o && o.przed > 0 ? Math.round(((o.przed - o.po) / o.przed) * 100) : 0;

  return (
    <section className="mt-8">
      <SectionHead
        title="Optymalizacja obrazów"
        desc="Zmniejsza pliki JPG i PNG bez utraty jakości — strona ładuje się szybciej. Każde kolejne uruchomienie bierze tylko nowe pliki."
      />
      <div className="rounded-[10px] border border-line bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-[13px] font-medium text-foreground">
            Katalog w public_html (puste = cała strona)
            <input className={`${INPUT} mt-1`} value={katalog} onChange={(e) => setKatalog(e.target.value)} placeholder="wp-content/uploads" maxLength={200} />
          </label>
          <button
            type="button"
            className={BTN}
            disabled={pending || !stan || stan.wToku}
            onClick={() =>
              start(async () => {
                const r = await optymalizujObrazy(serviceId, domain, katalog.trim(), metadane);
                if (r.ok) {
                  setBlad(null);
                  setStan(r.stan);
                } else setBlad(r.error);
              })
            }
          >
            {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImageDown className="h-4 w-4" aria-hidden />}
            {stan?.wToku ? 'Optymalizuję…' : 'Optymalizuj obrazy'}
          </button>
        </div>
        <div className="mt-3">
          <Switch checked={metadane} onChange={setMetadane} label="Usuń metadane zdjęć (np. lokalizację GPS z telefonu)" />
        </div>
        {blad ? <p role="alert" className="m-0 mt-2 text-[13px] text-crit">{blad}</p> : null}
        {stan?.blad ? <p role="alert" className="m-0 mt-2 text-[13px] text-crit">{stan.blad}</p> : null}
        {o ? (
          <p className="m-0 mt-3 text-[13px] text-muted-foreground">
            Ostatnio ({new Date(o.kiedy).toLocaleString('pl-PL')}, {o.katalog || 'cała strona'}): {o.plikow.toLocaleString('pl-PL')} plików,{' '}
            {mb(o.przed)} → {mb(o.po)} ({zysk}% mniej).
            {o.zostalo > 0 ? ` Zostało ${o.zostalo.toLocaleString('pl-PL')} plików — uruchom ponownie, żeby je dokończyć.` : ''}
          </p>
        ) : null}
      </div>
    </section>
  );
}

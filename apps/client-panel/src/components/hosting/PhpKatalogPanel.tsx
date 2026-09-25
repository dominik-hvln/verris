'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { SectionHead } from '@/components/panel/v2';
import { Select } from '@/components/panel/select';
import { fetchPhpStatus } from '@/app/dashboard/php/php-actions';
import {
  fetchPhpKatalogu,
  readPhpKatalogu,
  savePhpKatalogu,
  type PhpKataloguStatus,
} from '@/app/dashboard/services/[id]/hosting-htaccess-actions';

const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const KATALOG = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+){0,9}$/;

/**
 * B-03 — inna wersja PHP dla podkatalogu strony (np. stary sklep na 7.4, reszta na 8.3). Zapis w bloku
 * Verris pliku .htaccess tego katalogu (handler LiteSpeed dla CloudLinux alt-php); po zapisie serwer
 * sprawdza katalog i przy błędzie 5xx przywraca poprzedni plik.
 */
export function PhpKatalogPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [wersje, setWersje] = useState<string[]>([]);
  const [katalog, setKatalog] = useState('');
  const [stan, setStan] = useState<PhpKataloguStatus | null>(null);
  const [wybor, setWybor] = useState('');
  const [blad, setBlad] = useState<string | null>(null);
  const [odczyt, setOdczyt] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    void fetchPhpStatus(serviceId).then((s) => setWersje(s?.availableVersions ?? []));
  }, [serviceId]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setTimeout(async () => {
      const r = await fetchPhpKatalogu(serviceId, domain, stan.katalog);
      if (r.ok) {
        setStan(r.status);
        if (!r.status.wToku) setWybor(r.status.php ?? '');
      }
      setOdczyt((n) => n + 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [serviceId, domain, stan, odczyt]);

  const czysty = katalog.trim().replace(/^\/+|\/+$/g, '');
  const poprawny = KATALOG.test(czysty) && !czysty.split('/').some((c) => c === '.' || c === '..');
  const zajety = pending || !!stan?.wToku;
  const przyjmij = (r: Awaited<ReturnType<typeof fetchPhpKatalogu>>) => {
    if (!r.ok) return setBlad(r.error);
    setBlad(null);
    setStan(r.status);
  };

  return (
    <section className="mt-8">
      <SectionHead
        title="PHP w podkatalogu"
        desc={`Inna wersja PHP dla jednego katalogu w ${domain}, np. starej aplikacji. Reszta strony zostaje przy wersji domeny.`}
      />
      <div className="rounded-[10px] border border-line bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-[13px] font-medium text-foreground">
            Katalog w public_html
            <input
              className={`${INPUT} mt-1`}
              value={katalog}
              onChange={(e) => {
                setKatalog(e.target.value);
                setStan(null);
              }}
              placeholder="sklep albo blog/stary"
              maxLength={200}
            />
          </label>
          <button type="button" className={BTN} disabled={!poprawny || zajety} onClick={() => start(async () => przyjmij(await readPhpKatalogu(serviceId, domain, czysty)))}>
            {zajety && !stan?.odczytano ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Sprawdź katalog
          </button>
        </div>
        {blad ? <p role="alert" className="m-0 mt-2 text-[13px] text-crit">{blad}</p> : null}
        {stan?.blad ? <p role="alert" className="m-0 mt-2 text-[13px] text-crit">{stan.blad}</p> : null}
        {stan?.wToku ? <p className="m-0 mt-2 text-[13px] text-muted-foreground">Serwer sprawdza katalog…</p> : null}
        {stan?.odczytano && !stan.wToku ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px]">
              <span className="mb-1 block text-[13px] font-medium text-foreground">
                Wersja PHP katalogu {stan.katalog} (teraz: {stan.php ? stan.php : 'jak domena'})
              </span>
              <Select
                aria-label="Wersja PHP katalogu"
                value={wybor}
                onChange={setWybor}
                options={[{ value: '', label: 'Jak domena' }, ...wersje.map((v) => ({ value: v, label: `PHP ${v}` }))]}
                className="w-full"
              />
            </div>
            <button
              type="button"
              className={BTN}
              disabled={zajety || wybor === (stan.php ?? '')}
              onClick={() => start(async () => przyjmij(await savePhpKatalogu(serviceId, domain, stan.katalog, wybor)))}
            >
              Zapisz
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

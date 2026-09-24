'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/panel/select';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { fetchDomainPhp } from '@/app/dashboard/php/php-actions';

/**
 * L-05 — polecenie crona ze skryptem PHP w wybranej wersji. Wersje = sloty PHP serwera
 * (te same co przy domenie); binarka CustomBuild `/usr/local/phpXY/bin/php`, ścieżka od $HOME,
 * więc nie trzeba znać loginu konta.
 * ponytail: tylko ścieżka w public_html domeny; argumenty skryptu klient dopisze w polu polecenia.
 */
export function phpCronCommand(release: string, domain: string, path: string): string {
  const bin = `/usr/local/php${release.replace('.', '')}/bin/php`;
  const plik = path.trim().replace(/^\/+/, '');
  return `${bin} -q $HOME/domains/${domain}/public_html/${plik}`;
}

const SCIEZKA_RE = /^[A-Za-z0-9._\-/]+$/;

export function CronPhpHelper({ serviceId, onUse }: { serviceId: string; onUse: (command: string) => void }) {
  const [domeny, setDomeny] = useState<string[]>([]);
  const [wersje, setWersje] = useState<string[]>([]);
  const [domena, setDomena] = useState('');
  const [wersja, setWersja] = useState('');
  const [sciezka, setSciezka] = useState('cron.php');

  useEffect(() => {
    let off = false;
    fetchHostingDomainsAction(serviceId)
      .then(async (r) => {
        const lista = r.domains.map((d) => d.name);
        if (off || !lista.length) return;
        setDomeny(lista);
        const php = await fetchDomainPhp(serviceId, lista[0]);
        if (!off && php) setWersje(php.slotReleases.filter(Boolean));
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [serviceId]);

  if (!domeny.length || !wersje.length) return null;
  const d = domena || domeny[0];
  const w = wersja || wersje[0];
  const ok = SCIEZKA_RE.test(sciezka) && !sciezka.split('/').includes('..');

  return (
    <div className="mt-3 rounded-lg border border-line bg-raised px-3 py-3">
      <p className="m-0 mb-2 text-xs font-medium text-foreground">Skrypt PHP w wybranej wersji</p>
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
        <Select aria-label="Wersja PHP" value={w} onChange={setWersja} options={wersje.map((v) => ({ value: v, label: `PHP ${v}` }))} className="w-full sm:w-32" />
        <Select aria-label="Domena" value={d} onChange={setDomena} options={domeny.map((v) => ({ value: v, label: v }))} className="w-full" />
        <input
          aria-label="Plik w public_html"
          value={sciezka}
          onChange={(e) => setSciezka(e.target.value)}
          placeholder="cron.php"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-data"
        />
        <button
          type="button"
          disabled={!ok}
          onClick={() => onUse(phpCronCommand(w, d, sciezka))}
          className="whitespace-nowrap rounded-lg border border-line-strong bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-raised disabled:opacity-50"
        >
          Wstaw polecenie
        </button>
      </div>
    </div>
  );
}

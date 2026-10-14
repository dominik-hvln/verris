import * as dnsLookup from 'node:dns/promises';
import { BadRequestException } from '@nestjs/common';
import { DOMENA_MIGRACJI } from './migration-orchestrator.service.js';

/**
 * 14.10 — plan uproszczenia migratora, krok „Skąd”: zanim klient wpisze adres starego panelu, odczytujemy z DNS,
 * gdzie dziś stoi strona i poczta, i podpowiadamy host (nazwa z rekordu PTR adresu strony albo serwer poczty).
 * Tylko zapytania DNS — żadnego połączenia z cudzym hostem (to robią discover/preflight, z limitem i kontrolą SSRF).
 */
export interface RozpoznanieZrodla {
  domena: string;
  a: string[];
  mx: string[];
  ns: string[];
  /** Nazwa hosta do podpowiedzi w polu „adres panelu”; null, gdy DNS nic sensownego nie mówi. */
  podpowiedzHosta: string | null;
}

export type Resolver = Pick<typeof dnsLookup, 'resolve4' | 'resolveMx' | 'resolveNs' | 'reverse'>;

const NAZWA = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const czysc = (h: string) => h.trim().toLowerCase().replace(/\.$/, '');
const tylkoNazwy = (lista: string[]) => [...new Set(lista.map(czysc).filter((h) => NAZWA.test(h)))];

export async function rozpoznajZrodlo(domenaWejscie: string, r: Resolver = dnsLookup): Promise<RozpoznanieZrodla> {
  const domena = czysc(domenaWejscie ?? '');
  if (!DOMENA_MIGRACJI.test(domena)) throw new BadRequestException('Podaj sam adres strony, np. firma.pl.');
  const [a, mxRek, ns] = await Promise.all([
    r.resolve4(domena).catch(() => [] as string[]),
    r.resolveMx(domena).catch(() => [] as { exchange: string; priority: number }[]),
    r.resolveNs(domena).catch(() => [] as string[]),
  ]);
  const mx = tylkoNazwy([...mxRek].sort((x, y) => x.priority - y.priority).map((m) => m.exchange));
  let ptr: string[] = [];
  if (a[0]) ptr = tylkoNazwy(await r.reverse(a[0]).catch(() => [] as string[]));
  // PTR adresu strony to zwykle nazwa serwera hostingu (np. serwer123.dostawca.pl) — pod nią działa panel i FTP.
  // Bez PTR: serwer poczty, jeśli nie jest usługą pocztową w chmurze (tam panelu hostingu nie ma).
  const pocztaWChmurze = /(google\.com|googlemail\.com|outlook\.com|protection\.outlook\.com|zoho\.|mailgun\.|amazonaws\.com)$/;
  const podpowiedzHosta = ptr[0] ?? mx.find((m) => !pocztaWChmurze.test(m)) ?? null;
  return { domena, a: a.slice(0, 4), mx: mx.slice(0, 4), ns: tylkoNazwy(ns).slice(0, 4), podpowiedzHosta };
}

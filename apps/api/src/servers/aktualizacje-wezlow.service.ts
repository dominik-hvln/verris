import { BadRequestException, Injectable } from '@nestjs/common';
import { ServerStatus } from '@verris/database';
import {
  CVE_RE,
  WAGI_ALARMU,
  WAGI_POPRAWEK,
  type AktualizacjaCustomBuild,
  type StanAktualizacjiWezla,
  type WagaPoprawki,
} from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { NodeTasksService, type StanFali } from './node-tasks.service.js';

/** Raport starszy niż doba to „brak świeżych danych” — nie „wszystko aktualne”. */
export const SWIEZOSC_RAPORTU_MS = 24 * 60 * 60 * 1000;

const KOLEJNOSC_WAG = new Map<WagaPoprawki, number>(WAGI_POPRAWEK.map((w, i) => [w, i]));

export interface WezelAktualizacji {
  id: string;
  nazwa: string;
  status: ServerStatus;
  /** świeży raport / raport starszy niż doba / brak raportu */
  dane: 'swieze' | 'stare' | 'brak';
  sprawdzono: string | null;
  poprawek: number;
  /** poprawek Critical/Important */
  waznych: number;
  bladDnf: string | null;
  custombuild: AktualizacjaCustomBuild[];
  bladCustomBuild: string | null;
  altPhp: Record<string, string>;
}

export interface PoprawkaFloty {
  advisory: string;
  waga: WagaPoprawki;
  cve: string[];
  pakiety: string[];
  wezly: { id: string; nazwa: string }[];
}

export interface WynikCve {
  cve: string;
  /** węzły z oczekującą poprawką na ten CVE */
  doZalatania: { id: string; nazwa: string; advisory: string[]; pakiety: string[] }[];
  /** węzły ze świeżym raportem bez tego CVE na liście */
  bezPoprawkiNaLiscie: { id: string; nazwa: string }[];
  /** węzły bez świeżego raportu — nie wiadomo */
  bezDanych: { id: string; nazwa: string }[];
  komunikat: string;
}

export interface PodsumowanieAktualizacji {
  wezly: WezelAktualizacji[];
  poprawki: PoprawkaFloty[];
  kafelki: { wezlowZWaznymi: number; poprawek: number; wezlowBezDanych: number };
  fala: StanFali | null;
  cve: WynikCve | null;
}

/**
 * 21.10 — weryfikator aktualizacji bezpieczeństwa: podsumowanie floty z raportów agenta (Server.aktualizacje)
 * i zlecenie fali samych poprawek (kanarek → reszta, NodeTasksService.queueFleetUpdate w trybie bezpieczeństwa).
 */
@Injectable()
export class AktualizacjeWezlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeTasks: NodeTasksService,
  ) {}

  async podsumowanie(cveWej?: string, teraz = new Date()): Promise<PodsumowanieAktualizacji> {
    const cve = cveWej ? normalizuj(cveWej) : null;
    const serwery = (
      await this.prisma.server.findMany({
        where: { status: { notIn: [ServerStatus.INIT, ServerStatus.DEPROVISIONING] } },
        select: { id: true, name: true, hostname: true, status: true, aktualizacje: true, aktualizacjeAt: true },
        orderBy: { name: 'asc' },
      })
    ).map((s) => ({ ...s, name: s.name ?? s.hostname ?? s.id }));
    const poprawki = new Map<string, PoprawkaFloty>();
    const wezly: WezelAktualizacji[] = serwery.map((s) => {
      const r = odczytajRaport(s.aktualizacje);
      const dane: WezelAktualizacji['dane'] =
        !r || !s.aktualizacjeAt ? 'brak' : teraz.getTime() - s.aktualizacjeAt.getTime() > SWIEZOSC_RAPORTU_MS ? 'stare' : 'swieze';
      const lista = r?.dnf.poprawki ?? [];
      for (const p of lista) {
        const g = poprawki.get(p.advisory) ?? { advisory: p.advisory, waga: p.waga, cve: [], pakiety: [], wezly: [] };
        if ((KOLEJNOSC_WAG.get(p.waga) ?? 9) < (KOLEJNOSC_WAG.get(g.waga) ?? 9)) g.waga = p.waga;
        for (const c of p.cve) if (!g.cve.includes(c)) g.cve.push(c);
        if (!g.pakiety.includes(p.pakiet)) g.pakiety.push(p.pakiet);
        if (!g.wezly.some((w) => w.id === s.id)) g.wezly.push({ id: s.id, nazwa: s.name });
        poprawki.set(p.advisory, g);
      }
      return {
        id: s.id,
        nazwa: s.name,
        status: s.status,
        dane,
        sprawdzono: r?.sprawdzono ?? null,
        poprawek: new Set(lista.map((p) => p.advisory)).size,
        waznych: new Set(lista.filter((p) => WAGI_ALARMU.includes(p.waga)).map((p) => p.advisory)).size,
        bladDnf: r?.dnf.blad ?? null,
        custombuild: r?.custombuild?.aktualizacje ?? [],
        bladCustomBuild: r?.custombuild?.blad ?? null,
        altPhp: r?.altPhp ?? {},
      };
    });
    const posortowane = [...poprawki.values()]
      .map((p) => ({ ...p, cve: p.cve.sort(), pakiety: p.pakiety.sort() }))
      .sort((a, b) => (KOLEJNOSC_WAG.get(a.waga) ?? 9) - (KOLEJNOSC_WAG.get(b.waga) ?? 9) || a.advisory.localeCompare(b.advisory));
    return {
      wezly,
      poprawki: posortowane,
      kafelki: {
        wezlowZWaznymi: wezly.filter((w) => w.waznych > 0).length,
        poprawek: posortowane.length,
        wezlowBezDanych: wezly.filter((w) => w.dane !== 'swieze').length,
      },
      fala: await this.nodeTasks.stanFali(),
      cve: cve ? wynikCve(cve, serwery, wezly) : null,
    };
  }

  /** Fala samych poprawek: wszystkie poprawki bezpieczeństwa albo tylko na podane CVE; opcjonalnie CustomBuild. */
  async zainstaluj(actorUserId: string, input: { cve?: string[]; custombuild?: boolean; serwery?: string[] }) {
    const cve = [...new Set((input.cve ?? []).map((c) => normalizuj(c)))];
    return this.nodeTasks.queueFleetUpdate(actorUserId, {
      tryb: 'bezpieczenstwo',
      ...(cve.length ? { cve } : {}),
      ...(input.custombuild ? { custombuild: true } : {}),
      ...(input.serwery?.length ? { serwery: [...new Set(input.serwery)] } : {}),
    });
  }
}

function normalizuj(tekst: string): string {
  const t = (tekst ?? '').trim().toUpperCase();
  if (!CVE_RE.test(t)) throw new BadRequestException(`Nieprawidłowy numer CVE: „${(tekst ?? '').slice(0, 40)}” (wzór: CVE-2026-12345).`);
  return t;
}

/** Raport z bazy (Json) → StanAktualizacjiWezla albo null, gdy kształt się nie zgadza (nie zgadujemy). */
function odczytajRaport(j: unknown): StanAktualizacjiWezla | null {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const r = j as Partial<StanAktualizacjiWezla>;
  if (!r.dnf || !Array.isArray(r.dnf.poprawki)) return null;
  return {
    sprawdzono: typeof r.sprawdzono === 'string' ? r.sprawdzono : '',
    dnf: { poprawki: r.dnf.poprawki, ...(r.dnf.blad ? { blad: r.dnf.blad } : {}) },
    custombuild: r.custombuild && Array.isArray(r.custombuild.aktualizacje) ? r.custombuild : null,
    altPhp: r.altPhp && typeof r.altPhp === 'object' ? r.altPhp : {},
  };
}

function wynikCve(
  cve: string,
  serwery: { id: string; name: string; aktualizacje: unknown }[],
  wezly: WezelAktualizacji[],
): WynikCve {
  const doZalatania: WynikCve['doZalatania'] = [];
  const bezPoprawkiNaLiscie: WynikCve['bezPoprawkiNaLiscie'] = [];
  const bezDanych: WynikCve['bezDanych'] = [];
  for (const w of wezly) {
    const r = odczytajRaport(serwery.find((s) => s.id === w.id)?.aktualizacje);
    const pasujace = (r?.dnf.poprawki ?? []).filter((p) => p.cve.includes(cve));
    if (pasujace.length) {
      doZalatania.push({ id: w.id, nazwa: w.nazwa, advisory: [...new Set(pasujace.map((p) => p.advisory))], pakiety: [...new Set(pasujace.map((p) => p.pakiet))] });
    } else if (w.dane !== 'swieze') bezDanych.push({ id: w.id, nazwa: w.nazwa });
    else bezPoprawkiNaLiscie.push({ id: w.id, nazwa: w.nazwa });
  }
  const komunikat = doZalatania.length
    ? `${cve}: poprawka czeka na ${doZalatania.length} z ${wezly.length} węzłów.`
    : `${cve}: żaden węzeł nie ma oczekującej poprawki. To znaczy, że jest już zainstalowana albo dystrybucja jeszcze jej nie wydała — bez sprawdzenia advisory producenta nie da się tego rozróżnić.`;
  return { cve, doZalatania, bezPoprawkiNaLiscie, bezDanych, komunikat };
}

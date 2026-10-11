import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * F3.7 (OE-14) — kolizje w zgłoszeniu: „kto teraz to ogląda / pisze odpowiedź”. Lekki znacznik obecności bez
 * websocketów: panel obsługi co OBECNOSC_ODPYTANIE_MS zgłasza „jestem (piszę / nie piszę)” i dostaje innych
 * obecnych. Znacznik żyje OBECNOSC_WAZNA_MS od ostatniego zgłoszenia — zamknięta karta znika sama.
 *
 * Pamięć procesu API, nie baza: znacznik jest ulotny, a API działa jako jedna replika (docker-compose.prod.yml,
 * usługa `api`). Przy kilku replikach trzeba by go przenieść do Redisa (jak licznik w rate-limit.guard.ts).
 */
export const OBECNOSC_WAZNA_MS = 30_000;
export const OBECNOSC_ODPYTANIE_MS = 10_000;
/** Bezpiecznik pamięci: najwięcej śledzonych zgłoszeń naraz (najstarsze wypadają). */
const MAX_ZGLOSZEN = 5_000;

export interface Obecny {
  userId: string;
  pisze: boolean;
  od: number;
  ostatnio: number;
}

/** Rejestr obecności (czysta logika z zegarem z zewnątrz — testowalna bez czekania). */
export class RejestrObecnosci {
  private readonly mapa = new Map<string, Map<string, Obecny>>();

  zglos(ticketId: string, userId: string, pisze: boolean, teraz: number): Obecny[] {
    this.sprzataj(teraz);
    let w = this.mapa.get(ticketId);
    if (!w) {
      if (this.mapa.size >= MAX_ZGLOSZEN) this.mapa.delete(this.mapa.keys().next().value!);
      w = new Map();
      this.mapa.set(ticketId, w);
    }
    const byl = w.get(userId);
    w.set(userId, { userId, pisze, od: byl?.od ?? teraz, ostatnio: teraz });
    return [...w.values()].filter((o) => o.userId !== userId).sort((a, b) => a.od - b.od);
  }

  /** Wyjście ze zgłoszenia (zamknięcie karty) — znika od razu, bez czekania na wygaśnięcie. */
  odejdz(ticketId: string, userId: string): void {
    const w = this.mapa.get(ticketId);
    w?.delete(userId);
    if (w && !w.size) this.mapa.delete(ticketId);
  }

  private sprzataj(teraz: number): void {
    for (const [id, w] of this.mapa) {
      for (const [u, o] of w) if (teraz - o.ostatnio > OBECNOSC_WAZNA_MS) w.delete(u);
      if (!w.size) this.mapa.delete(id);
    }
  }
}

@Injectable()
export class ObecnoscZgloszenService {
  private readonly rejestr = new RejestrObecnosci();

  constructor(private readonly prisma: PrismaService) {}

  /** Zgłoszenie obecności; zwraca innych obecnych z imieniem i inicjałem (id zostają w zespole). */
  async zglos(ticketId: string, userId: string, pisze: boolean) {
    const inni = this.rejestr.zglos(ticketId, userId, pisze, Date.now());
    if (!inni.length) return { inni: [] };
    const ludzie = await this.prisma.user.findMany({
      where: { id: { in: inni.map((o) => o.userId) } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return {
      inni: inni.map((o) => {
        const u = ludzie.find((l) => l.id === o.userId);
        const nazwa = u?.firstName ? `${u.firstName}${u.lastName ? ` ${u.lastName[0]}.` : ''}` : u?.email ?? 'ktoś z zespołu';
        return { userId: o.userId, nazwa, pisze: o.pisze, od: new Date(o.od).toISOString() };
      }),
    };
  }

  odejdz(ticketId: string, userId: string) {
    this.rejestr.odejdz(ticketId, userId);
    return { ok: true as const };
  }
}

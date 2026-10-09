import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizujKraj, STAWKI_UE } from './vat.js';
import {
  AKCJA_COFNIETY, AKCJA_DANE_ZMIENIONE, AKCJA_ZWERYFIKOWANY, BEZ_WERYFIKACJI, weryfikacjaPozaUeAktualna, zmianaDanychVat,
} from './vat-weryfikacja.js';

export interface Operator {
  userId: string;
  role: Role | string;
}

const POLA = {
  id: true,
  role: true,
  anonymizedAt: true,
  country: true,
  nip: true,
  companyName: true,
  vatWeryfikacjaAt: true,
  vatWeryfikacjaPrzez: true,
  vatWeryfikacjaPodstawa: true,
  vatWeryfikacjaKraj: true,
} as const;

type Nabywca = Prisma.UserGetPayload<{ select: typeof POLA }>;

/**
 * DTO liczy długość przed przycięciem — same spacje przeszłyby i w dzienniku zostałaby pusta
 * podstawa/powód. Ślad „na podstawie czego” jest tu sednem, więc liczymy po `trim()`.
 */
function wymagajTekstu(t: string | null | undefined, min: number, komunikat: string): void {
  if ((t ?? '').trim().length < min) throw new BadRequestException(komunikat);
}

/**
 * Decyzja 2026-10-09 — weryfikacja nabywcy spoza UE i zmiana kraju/NIP przez obsługę.
 *
 * Każda operacja zapisuje się w `AuditLog` w TEJ SAMEJ transakcji co zmiana (AuditService
 * połyka błędy zapisu — tu brak wpisu = brak zmiany). Firma z UE nie jest tu weryfikowana:
 * jej numer VAT-UE sprawdza VIES przy każdej płatności (vat-nabywcy.service.ts).
 */
@Injectable()
export class VatWeryfikacjaService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string, op: Operator) {
    const u = await this.nabywca(userId, op);
    return this.widok(u);
  }

  /** „Zweryfikuj status VAT nabywcy” — tylko kraj spoza UE; od następnej płatności cena netto. */
  async zweryfikuj(userId: string, podstawa: string, op: Operator) {
    wymagajTekstu(podstawa, 10, 'Podstawa weryfikacji: co najmniej 10 znaków (dokument, rejestr, kto potwierdził).');
    const u = await this.nabywca(userId, op);
    const kraj = normalizujKraj(u.country);
    if (kraj === 'PL' || kraj in STAWKI_UE) {
      throw new BadRequestException(
        kraj === 'PL'
          ? 'Nabywca z Polski — zawsze 23% VAT, weryfikacja nie dotyczy.'
          : 'Firma z UE: status sprawdza VIES przy płatności na podstawie numeru VAT-UE z profilu — ręczna weryfikacja nie dotyczy.',
      );
    }
    const teraz = new Date();
    const zapisany = await this.prisma.$transaction(async (tx) => {
      const w = await tx.user.update({
        where: { id: u.id },
        data: {
          vatWeryfikacjaAt: teraz,
          vatWeryfikacjaPrzez: op.userId,
          vatWeryfikacjaPodstawa: podstawa.trim(),
          vatWeryfikacjaKraj: kraj,
        },
        select: POLA,
      });
      await tx.auditLog.create({
        data: {
          action: AKCJA_ZWERYFIKOWANY,
          userId: u.id,
          actorUserId: op.userId,
          details: { kraj, nip: u.nip ?? null, podstawa: podstawa.trim(), poprzednio: this.slad(u) },
        },
      });
      return w;
    });
    return this.widok(zapisany);
  }

  /** Cofnięcie weryfikacji (np. księgowa nie potwierdziła) — od następnej płatności 23%. */
  async cofnij(userId: string, powod: string, op: Operator) {
    wymagajTekstu(powod, 5, 'Powód: co najmniej 5 znaków.');
    const u = await this.nabywca(userId, op);
    if (!u.vatWeryfikacjaAt) throw new BadRequestException('Nabywca nie ma weryfikacji do cofnięcia.');
    const zapisany = await this.prisma.$transaction(async (tx) => {
      const w = await tx.user.update({ where: { id: u.id }, data: { ...BEZ_WERYFIKACJI }, select: POLA });
      await tx.auditLog.create({
        data: {
          action: AKCJA_COFNIETY,
          userId: u.id,
          actorUserId: op.userId,
          details: { powod: powod.trim(), poprzednio: this.slad(u) },
        },
      });
      return w;
    });
    return this.widok(zapisany);
  }

  /**
   * Zmiana kraju rozliczenia / NIP przez obsługę — także po pierwszej płatności (klient sam już
   * nie może). Każda zmiana któregokolwiek z nich zeruje weryfikację.
   */
  async zmienDane(userId: string, dto: { country?: string; nip?: string; powod: string }, op: Operator) {
    wymagajTekstu(dto.powod, 5, 'Powód zmiany: co najmniej 5 znaków (np. numer zgłoszenia).');
    const u = await this.nabywca(userId, op);
    const zmiana = zmianaDanychVat(u, { country: dto.country, nip: dto.nip });
    if (!zmiana.kraj && !zmiana.nip) throw new BadRequestException('Kraj i NIP są takie same jak w profilu — nic do zmiany.');
    const zapisany = await this.prisma.$transaction(async (tx) => {
      const w = await tx.user.update({
        where: { id: u.id },
        data: {
          ...(zmiana.kraj && { country: normalizujKraj(dto.country) }),
          ...(zmiana.nip && { nip: dto.nip?.trim() || null }),
          ...BEZ_WERYFIKACJI,
        },
        select: POLA,
      });
      await tx.auditLog.create({
        data: {
          action: AKCJA_DANE_ZMIENIONE,
          userId: u.id,
          actorUserId: op.userId,
          details: {
            powod: dto.powod.trim(),
            kraj: { przed: u.country ?? null, po: w.country ?? null },
            nip: { przed: u.nip ?? null, po: w.nip ?? null },
            weryfikacjaWyzerowana: Boolean(u.vatWeryfikacjaAt),
            poprzednio: this.slad(u),
          },
        },
      });
      return w;
    });
    return this.widok(zapisany);
  }

  private async nabywca(userId: string, op: Operator): Promise<Nabywca> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: POLA });
    if (!u || u.anonymizedAt) throw new NotFoundException('Nie znaleziono klienta.');
    // Jak karta klienta (users.admin.service getCustomer360): personel działa tylko na kontach klientów.
    if (op.role !== Role.ADMIN && u.role !== Role.USER) {
      throw new ForbiddenException('Personel może zmieniać dane rozliczeniowe wyłącznie klientów.');
    }
    return u;
  }

  private slad(u: Nabywca) {
    return u.vatWeryfikacjaAt
      ? {
          at: u.vatWeryfikacjaAt.toISOString(),
          przez: u.vatWeryfikacjaPrzez,
          podstawa: u.vatWeryfikacjaPodstawa,
          kraj: u.vatWeryfikacjaKraj,
        }
      : null;
  }

  private widok(u: Nabywca) {
    const kraj = normalizujKraj(u.country);
    const pozaUe = kraj !== 'PL' && !(kraj in STAWKI_UE);
    return {
      userId: u.id,
      kraj,
      nip: u.nip ?? null,
      pozaUe,
      /** Spoza UE i bez aktualnej weryfikacji — płatności po 23%, dopóki obsługa nie zweryfikuje. */
      wymagaWeryfikacji: pozaUe && !weryfikacjaPozaUeAktualna(u),
      weryfikacja: u.vatWeryfikacjaAt
        ? {
            at: u.vatWeryfikacjaAt.toISOString(),
            przez: u.vatWeryfikacjaPrzez,
            podstawa: u.vatWeryfikacjaPodstawa,
            kraj: u.vatWeryfikacjaKraj,
            aktualna: weryfikacjaPozaUeAktualna(u),
          }
        : null,
    };
  }
}

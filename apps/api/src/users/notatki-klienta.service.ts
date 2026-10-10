import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { AdminCustomerActions } from '../common/audit/audit.actions.js';

export interface NotatkaKlienta {
  id: string;
  tresc: string;
  przypieta: boolean;
  utworzono: string;
  autor: { id: string; nazwa: string } | null;
}

const MAKS_NOTATEK = 200;

/**
 * F2.4 (10.10) — notatki wewnętrzne o kliencie: wiele, z autorem, datą i przypięciem (wcześniej jedno pole
 * User.adminInternalNote, nadpisywane bez historii). Dopisywanie bez edycji i usuwania — notatka to ślad pracy
 * obsługi. Tylko konta klientów (USER), bez zanonimizowanych. Klient notatek nie widzi; w dzienniku zostaje
 * fakt dodania i przypięcia (bez treści).
 */
@Injectable()
export class NotatkiKlientaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async klient(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, anonymizedAt: true } });
    if (!u || u.anonymizedAt) throw new NotFoundException('Klient nie istnieje.');
    if (u.role !== Role.USER) throw new ForbiddenException('Notatki prowadzi się tylko na kontach klientów.');
  }

  async lista(userId: string): Promise<{ notatki: NotatkaKlienta[] }> {
    await this.klient(userId);
    const rows = await this.prisma.customerNote.findMany({
      where: { userId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: MAKS_NOTATEK,
      select: {
        id: true,
        body: true,
        pinned: true,
        createdAt: true,
        author: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    return {
      notatki: rows.map((r) => ({
        id: r.id,
        tresc: r.body,
        przypieta: r.pinned,
        utworzono: r.createdAt.toISOString(),
        autor: r.author
          ? { id: r.author.id, nazwa: [r.author.firstName, r.author.lastName].filter(Boolean).join(' ').trim() || r.author.email }
          : null,
      })),
    };
  }

  async dodaj(userId: string, autorId: string, dto: { tresc: string; przypieta?: boolean }) {
    if (!dto.tresc?.trim()) throw new BadRequestException('Notatka nie może być pusta.');
    await this.klient(userId);
    const n = await this.prisma.customerNote.create({
      data: { userId, authorId: autorId, body: dto.tresc.trim(), pinned: dto.przypieta ?? false },
      select: { id: true, pinned: true },
    });
    await this.audit.record({
      action: AdminCustomerActions.CUSTOMER_NOTE_ADDED,
      userId,
      actorUserId: autorId,
      details: { noteId: n.id, przypieta: n.pinned, znakow: dto.tresc.trim().length },
    });
    return { id: n.id };
  }

  async przypnij(userId: string, noteId: string, autorId: string, przypieta: boolean) {
    await this.klient(userId);
    const n = await this.prisma.customerNote.findUnique({ where: { id: noteId }, select: { userId: true, pinned: true } });
    if (!n || n.userId !== userId) throw new NotFoundException('Notatka nie istnieje na koncie tego klienta.');
    if (n.pinned === przypieta) return { id: noteId, przypieta };
    await this.prisma.customerNote.update({ where: { id: noteId }, data: { pinned: przypieta } });
    await this.audit.record({
      action: AdminCustomerActions.CUSTOMER_NOTE_PINNED,
      userId,
      actorUserId: autorId,
      details: { noteId, przypieta },
    });
    return { id: noteId, przypieta };
  }
}

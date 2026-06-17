import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

export interface CannedResponseInput {
  title: string;
  content: string;
  topic?: string | null;
  isActive?: boolean;
}

/**
 * SUP-2 — canned (template) responses for staff/admin. Filterable by ticket
 * topic so the agent sees the most relevant templates first; global templates
 * (topic = null) always apply.
 */
@Injectable()
export class CannedResponseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Staff view: active templates, topic-matched first (global ones included). */
  async listForStaff(topic?: string) {
    const rows = await this.prisma.cannedResponse.findMany({
      where: { isActive: true },
      orderBy: [{ topic: 'asc' }, { title: 'asc' }],
    });
    const t = topic?.toUpperCase();
    const rank = (r: { topic: string | null }) => (t && r.topic === t ? 0 : r.topic == null ? 1 : 2);
    return rows
      .sort((a, b) => rank(a) - rank(b))
      .map((r) => ({ id: r.id, title: r.title, content: r.content, topic: r.topic }));
  }

  /** Admin view: all templates. */
  async listAll() {
    return this.prisma.cannedResponse.findMany({ orderBy: [{ topic: 'asc' }, { title: 'asc' }] });
  }

  async create(input: CannedResponseInput, actorUserId: string) {
    const row = await this.prisma.cannedResponse.create({
      data: {
        title: input.title.trim(),
        content: input.content,
        topic: input.topic?.toUpperCase() || null,
        isActive: input.isActive ?? true,
        createdById: actorUserId,
      },
    });
    await this.audit.record({ action: 'CANNED_RESPONSE_CREATED', actorUserId, details: { id: row.id } });
    return row;
  }

  async update(id: string, input: Partial<CannedResponseInput>, actorUserId: string) {
    const existing = await this.prisma.cannedResponse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Szablon nie istnieje.');
    const row = await this.prisma.cannedResponse.update({
      where: { id },
      data: {
        title: input.title?.trim() ?? undefined,
        content: input.content ?? undefined,
        topic: input.topic === undefined ? undefined : input.topic?.toUpperCase() || null,
        isActive: input.isActive ?? undefined,
      },
    });
    await this.audit.record({ action: 'CANNED_RESPONSE_UPDATED', actorUserId, details: { id } });
    return row;
  }

  async remove(id: string, actorUserId: string) {
    await this.prisma.cannedResponse.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Szablon nie istnieje.');
    });
    await this.audit.record({ action: 'CANNED_RESPONSE_DELETED', actorUserId, details: { id } });
    return { ok: true as const };
  }
}

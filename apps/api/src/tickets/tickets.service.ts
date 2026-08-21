import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import {
  newTicketCreatedTemplate,
  ticketReplyNotificationTemplate,
  ticketStatusChangedTemplate,
  ticketStaffAssignedTemplate,
} from '../mail/templates/ticket-notifications';
import {
  assertAllowedMime,
  makeStorageKey,
  sanitizeOriginalFilename,
  TICKET_MAX_ATTACHMENTS_PER_TICKET,
  TICKET_UPLOAD_MAX_BYTES,
  TICKET_UPLOAD_MAX_FILES_PER_BATCH,
} from './ticket-attachment.utils';
import { CreateTicketDto, AddTicketReplyDto } from './tickets.dto';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ObjectBuckets } from '../storage/object-storage.types';
import { AuditService } from '../common/audit/audit.service';
import { TicketOpsActions } from '../common/audit/audit.actions';
import { NotificationsService } from '../notifications/notifications.service';
import type { Readable } from 'stream';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** SUP-V2 — zapis zdarzenia na osi czasu ticketu (best-effort, append-only). */
  private async logEvent(
    ticketId: string,
    type: string,
    actorId?: string | null,
    meta?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    try {
      await this.prisma.ticketEvent.create({
        data: { ticketId, type, actorId: actorId ?? null, meta: meta ?? undefined },
      });
    } catch {
      // oś czasu jest pomocnicza — nie wywracamy operacji biznesowej
    }
  }

  /** SUP-V2 — powiadomienie in-app (dzwonek) dla pracownika. */
  private async notifyStaff(
    staffUserId: string,
    n: { title: string; body: string; link?: string | null; severity?: 'info' | 'warning' | 'critical' },
  ): Promise<void> {
    await this.notifications.create({
      userId: staffUserId,
      category: 'SUPPORT',
      severity: n.severity ?? 'info',
      title: n.title,
      body: n.body,
      link: n.link ?? null,
    });
  }

  /**
   * Helper: Znajduje "najluźniejszego" pracownika z rolą STAFF lub ADMIN.
   */
  private async getLeastBusyAgentId(): Promise<string | null> {
    const staffMembers = await this.prisma.user.findMany({
      where: {
        role: { in: ['STAFF', 'ADMIN'] },
      },
      select: {
        id: true,
        _count: {
          select: {
            assignedTickets: {
              where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
            },
          },
        },
      },
    });

    if (!staffMembers.length) return null;

    // Sort by number of open tickets
    staffMembers.sort(
      (a, b) => a._count.assignedTickets - b._count.assignedTickets,
    );
    return staffMembers[0].id;
  }

  /**
   * Tworzy nowe zgłoszenie od klienta i przypisuje agenta.
   */
  async create(userId: string, dto: CreateTicketDto) {
    const assignedToId = await this.getLeastBusyAgentId();

    // P-8 — active priority-support add-on bumps the ticket to at least HIGH.
    const buyer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { prioritySupport: true, prioritySupportUntil: true },
    });
    const priorityActive =
      !!buyer?.prioritySupport &&
      !!buyer.prioritySupportUntil &&
      buyer.prioritySupportUntil.getTime() > Date.now();
    const order = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    let priority = dto.priority || 'NORMAL';
    if (priorityActive && order.indexOf(priority) < order.indexOf('HIGH')) {
      priority = 'HIGH';
    }

    const row = await this.prisma.ticket.create({
      data: {
        subject: dto.subject,
        message: dto.message,
        priority,
        department: dto.department || 'TECHNICAL',
        topic: dto.topic || null,
        userId,
        assignedToId,
        lastReplyAt: new Date(),
        lastReplyIsStaff: false,
        slaResponseDueAt: computeSlaResponseDueAt(priority),
        slaResolveDueAt: computeSlaResolveDueAt(priority),
      },
      include: {
        user: { select: { email: true } },
        assignedTo: { select: { email: true } },
      },
    });

    const clientUrl = this.config.get<string>('clientPanelUrl') ?? 'http://localhost:3001';
    if (row.assignedTo?.email) {
      void this.mailer
        .send({
          to: row.assignedTo.email,
          subject: `[Verris] Nowe zgłoszenie: ${row.subject}`,
          text: `Przypisano Ci nowe zgłoszenie (#${row.id}).\n\n${row.message}\n\n— Panel: ${clientUrl}/dashboard/support`,
          tag: 'ticket.created',
          category: 'TRANSACTIONAL',
          fromRole: 'NOREPLY',
        })
        .catch(() => undefined);
    }

    void this.mailer
      .send({
        ...newTicketCreatedTemplate({
          ticketId: row.id,
          subject: row.subject,
          customerEmail: row.user.email,
          panelUrl: clientUrl,
        }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch(() => undefined);

    await this.logEvent(row.id, 'TICKET_CREATED', userId);
    if (row.assignedToId) {
      await this.notifyStaff(row.assignedToId, {
        title: 'Nowe zgłoszenie',
        body: `#${row.id.slice(0, 8)} — ${row.subject}`,
        link: `/tickets/${row.id}`,
      });
    }

    return {
      id: row.id,
      subject: row.subject,
      status: row.status,
      createdAt: row.createdAt,
      assignedToId: row.assignedToId,
    };
  }

  /**
   * Pobiera listę zgłoszeń użytkownika (obcięty widok klienta).
   */
  async findAllByUser(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        status: true,
        message: true,
        priority: true,
        department: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { replies: true } },
      },
    });
  }

  /**
   * Pobiera pojedyncze zgłoszenie dla klienta.
   */
  async findOne(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            replyId: true,
            uploadedById: true,
            createdAt: true,
          },
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            attachments: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                replyId: true,
                uploadedById: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Zgłoszenie nie zostało znalezione');
    if (ticket.userId !== userId) throw new ForbiddenException('Brak dostępu');

    // SUP-5 — surface the customer's guaranteed first-response time (best plan).
    const supportSlaHours = await this.getUserSupportSla(userId);
    return { ...ticket, supportSlaHours };
  }

  /** SUP-5 — highest support SLA (hours) across the user's active subscriptions. */
  async getUserSupportSla(userId: string): Promise<number> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: { in: ['ACTIVE', 'PROVISIONING', 'PAST_DUE'] } },
      include: { plan: { select: { supportSlaHours: true } } },
    });
    return subs.reduce((max, s) => Math.max(max, s.plan.supportSlaHours ?? 0), 0);
  }

  /** SUP-4 — customer rates support after the ticket is closed (once). */
  async submitCsat(ticketId: string, userId: string, rating: number, comment?: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Zgłoszenie nie zostało znalezione');
    if (ticket.userId !== userId) throw new ForbiddenException('Brak dostępu');
    if (ticket.status !== 'CLOSED') {
      throw new BadRequestException('Ocenić można tylko zamknięte zgłoszenie.');
    }
    if (ticket.csatRating != null) {
      throw new BadRequestException('To zgłoszenie zostało już ocenione.');
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Ocena musi być liczbą 1-5.');
    }
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { csatRating: rating, csatComment: comment?.slice(0, 2000) ?? null, csatAt: new Date() },
    });
    return { ok: true as const };
  }

  /**
   * Klient dodaje odpowiedź do zgłoszenia.
   */
  async addReply(ticketId: string, userId: string, dto: AddTicketReplyDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Zgłoszenie nie zostało znalezione');
    if (ticket.userId !== userId) throw new ForbiddenException('Brak dostępu');

    const [reply] = await this.prisma.$transaction([
      this.prisma.ticketReply.create({
        data: {
          message: dto.message,
          ticketId,
          authorId: userId,
          isStaff: false,
        },
      }),
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'OPEN',
          resolvedAt: null,
          waitingSince: null,
          customerReminderSentAt: null,
          autoClosedAt: null,
          lastReplyAt: new Date(),
          lastReplyIsStaff: false,
        }, // Reopen if they reply
      }),
    ]);

    const full = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { email: true } },
        assignedTo: { select: { email: true } },
      },
    });
    if (full) {
      await this.logEvent(ticketId, 'CUSTOMER_REPLY', full.userId);
      if (full.assignedToId) {
        await this.notifyStaff(full.assignedToId, {
          title: 'Nowa wiadomość od klienta',
          body: `#${ticketId.slice(0, 8)} — ${full.subject}`,
          link: `/tickets/${ticketId}`,
        });
      }
    }
    if (full?.assignedTo?.email) {
      this.notifyClientReplyToStaff(ticketId, full.subject, dto.message, full.assignedTo.email);
    }

    return reply;
  }

  // --- ADMIN & STAFF METHODS ---

  async adminFindAll(userId?: string) {
    return this.prisma.ticket.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { replies: true } },
      },
    });
  }

  async adminFindOne(ticketId: string): Promise<any> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: { 
            id: true, firstName: true, lastName: true, email: true, 
            companyName: true, nip: true, walletBalance: true, stripeCustomerId: true
          },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, type: true, actorId: true, meta: true, createdAt: true },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            replyId: true,
            uploadedById: true,
            createdAt: true,
          },
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            attachments: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                replyId: true,
                uploadedById: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async adminUpdateTicket(ticketId: string, dto: any, actorUserId?: string) {
    const existing = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { email: true } } },
    });
    if (!existing) throw new NotFoundException('Ticket not found');

    const dataToUpdate: any = { ...dto };
    if (dto.status === 'CLOSED') {
      dataToUpdate.resolvedAt = new Date();
    }
    // SUP-V2 — wejście/wyjście ze stanu „czeka na klienta" steruje cyklem auto-zamykania.
    if (dto.status && dto.status !== existing.status) {
      if (dto.status === 'WAITING_CUSTOMER') {
        dataToUpdate.waitingSince = new Date();
        dataToUpdate.customerReminderSentAt = null;
      } else {
        dataToUpdate.waitingSince = null;
        dataToUpdate.customerReminderSentAt = null;
      }
      if (dto.status !== 'CLOSED') {
        dataToUpdate.autoClosedAt = null;
      }
    }
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: dataToUpdate,
    });

    // SUP-V2 — historia zmiany statusu.
    if (dto.status && dto.status !== existing.status) {
      await this.logEvent(ticketId, 'STATUS_CHANGED', actorUserId, {
        from: existing.status,
        to: dto.status,
      });
    }
    // SUP-V2 — zmiana przypisania: zdarzenie + powiadomienie nowej osoby (in-app + e-mail).
    if (
      Object.prototype.hasOwnProperty.call(dto, 'assignedToId') &&
      (dto.assignedToId ?? null) !== (existing.assignedToId ?? null)
    ) {
      await this.logEvent(ticketId, 'ASSIGNMENT_CHANGED', actorUserId, {
        from: existing.assignedToId ?? null,
        to: dto.assignedToId ?? null,
      });
      if (dto.assignedToId) {
        await this.notifyStaff(dto.assignedToId, {
          title: 'Przypisano Ci zgłoszenie',
          body: `#${ticketId.slice(0, 8)} — ${updated.subject}`,
          link: `/tickets/${ticketId}`,
        });
        const assignee = await this.prisma.user.findUnique({
          where: { id: dto.assignedToId },
          select: { email: true },
        });
        if (assignee?.email) {
          void this.mailer
            .send({
              ...ticketStaffAssignedTemplate({
                to: assignee.email,
                ticketId,
                subject: updated.subject,
                staffPanelUrl: this.staffPanelBaseUrl(),
              }),
              category: 'TRANSACTIONAL',
              fromRole: 'NOREPLY',
            })
            .catch(() => undefined);
        }
      }
    }

    if (
      dto.status &&
      dto.status !== existing.status &&
      existing.user.email
    ) {
      const clientUrl = this.config.get<string>('clientPanelUrl') ?? 'http://localhost:3001';
      const statusLabel: Record<string, string> = {
        OPEN: 'Otwarte',
        IN_PROGRESS: 'W realizacji',
        CLOSED: 'Zamknięte',
      };
      const newLabel = statusLabel[dto.status] ?? dto.status;

      void this.mailer
        .send({
          ...ticketStatusChangedTemplate({
            ticketId,
            subject: updated.subject,
            customerEmail: existing.user.email,
            panelUrl: clientUrl,
            newStatus: newLabel,
          }),
          category: 'TRANSACTIONAL',
          fromRole: 'SUPPORT',
        })
        .catch(() => undefined);
    }

    return updated;
  }

  async adminEscalateTicket(ticketId: string, actorUserId: string, reason: string) {
    if (reason.trim().length < 10) {
      throw new BadRequestException('Powód eskalacji jest wymagany (min. 10 znaków).');
    }
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        escalatedAt: new Date(),
        escalatedById: actorUserId,
        escalationReason: reason.trim(),
        priority: 'URGENT',
        status: 'IN_PROGRESS',
      },
    });
    await this.audit.record({
      action: TicketOpsActions.TICKET_ESCALATED,
      userId: ticket.userId,
      actorUserId,
      details: { ticketId, reason: reason.trim(), priority: 'URGENT' },
    });
    await this.logEvent(ticketId, 'ESCALATED', actorUserId, { reason: reason.trim() });
    return ticket;
  }

  async adminApplyRunbook(ticketId: string, actorUserId: string, runbookKey: string) {
    const key = runbookKey.trim();
    if (key.length < 3) throw new BadRequestException('Runbook key is required.');
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { runbookKey: key },
    });
    await this.audit.record({
      action: TicketOpsActions.TICKET_RUNBOOK_APPLIED,
      userId: ticket.userId,
      actorUserId,
      details: { ticketId, runbookKey: key },
    });
    return ticket;
  }

  async adminSetRiskFlag(
    ticketId: string,
    actorUserId: string,
    riskFlag: string | null,
    riskReason: string | null,
  ) {
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        riskFlag: riskFlag?.trim() || null,
        riskReason: riskReason?.trim() || null,
      },
    });
    await this.audit.record({
      action: TicketOpsActions.CUSTOMER_RISK_FLAG_UPDATED,
      userId: ticket.userId,
      actorUserId,
      details: { ticketId, riskFlag: ticket.riskFlag, reason: ticket.riskReason },
    });
    return ticket;
  }

  async adminAddReply(ticketId: string, staffId: string, dto: AddTicketReplyDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const dataToUpdate: any = {
      status: 'WAITING_CUSTOMER',
      waitingSince: new Date(),
      customerReminderSentAt: null,
      autoClosedAt: null,
      lastReplyAt: new Date(),
      lastReplyIsStaff: true,
    };
    if (!ticket.firstResponseAt) {
      dataToUpdate.firstResponseAt = new Date(); // Złapanie SLA (TTFR)
    }

    const [reply] = await this.prisma.$transaction([
      this.prisma.ticketReply.create({
        data: {
          message: dto.message,
          ticketId,
          authorId: staffId,
          isStaff: true,
        },
      }),
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: dataToUpdate,
      }),
    ]);

    const full = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { email: true } } },
    });
    if (full) {
      await this.logEvent(ticketId, 'STAFF_REPLY', staffId);
    }
    if (full?.user?.email) {
      this.notifyStaffReplyToClient(ticketId, full.subject, dto.message, full.user.email);
    }

    return reply;
  }

  async getCannedResponses() {
    return this.prisma.cannedResponse.findMany({
      orderBy: { title: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Załączniki (E‑4) — przechowywane w MinIO/S3 (`verris-ticket-attachments`).
  // Lokalny FS nie jest używany.
  // ---------------------------------------------------------------------------

  /**
   * multipart: subject, message, opcja priority/department + pola `files`.
   * Bez plików zachowuje się jak zwykłe create (JSON).
   */
  async createWithOptionalFiles(
    userId: string,
    fields: { subject: string; message: string; priority?: string; department?: string; topic?: string },
    files?: Express.Multer.File[] | null,
  ) {
    const dto: CreateTicketDto = {
      subject: fields.subject,
      message: fields.message,
      priority: (fields.priority as CreateTicketDto['priority']) ?? 'NORMAL',
      department: (fields.department as CreateTicketDto['department']) ?? 'TECHNICAL',
      topic: fields.topic as CreateTicketDto['topic'],
    };

    const row = await this.create(userId, dto);
    const list = files?.filter(Boolean) ?? [];
    if (list.length > 0) {
      if (list.length > TICKET_UPLOAD_MAX_FILES_PER_BATCH) {
        throw new BadRequestException(`Maksymalnie ${TICKET_UPLOAD_MAX_FILES_PER_BATCH} plików naraz.`);
      }
      await this.saveAttachmentFiles({
        ticketId: row.id,
        replyId: null,
        uploadedById: userId,
        files: list,
      });
    }
    return this.findOne(row.id, userId);
  }

  /** Załączniki do pierwszej wiadomości (bez odpowiedzi w wątku) — tylko właściciel ticketa. */
  async addOpeningAttachments(
    ticketId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Zgłoszenie nie zostało znalezione');
    if (ticket.userId !== userId) throw new ForbiddenException('Brak dostępu');

    if (files.length === 0) {
      throw new BadRequestException('Brak plików.');
    }
    if (files.length > TICKET_UPLOAD_MAX_FILES_PER_BATCH) {
      throw new BadRequestException(`Maksymalnie ${TICKET_UPLOAD_MAX_FILES_PER_BATCH} plików naraz.`);
    }

    await this.saveAttachmentFiles({
      ticketId,
      replyId: null,
      uploadedById: userId,
      files,
    });
    return this.findOne(ticketId, userId);
  }

  private async saveAttachmentFiles(opts: {
    ticketId: string;
    replyId: string | null;
    uploadedById: string;
    files: Express.Multer.File[];
  }) {
    const { ticketId, replyId, uploadedById } = opts;

    let total = await this.prisma.ticketAttachment.count({ where: { ticketId } });
    for (const file of opts.files) {
      if (total >= TICKET_MAX_ATTACHMENTS_PER_TICKET) {
        throw new BadRequestException(
          `Limit ${TICKET_MAX_ATTACHMENTS_PER_TICKET} załączników przy tym zgłoszeniu został osiągnięty.`,
        );
      }
      if (!file.size || file.size > TICKET_UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          file.size === 0
            ? `Pusty plik (${file.originalname}).`
            : `Plik przekracza ${TICKET_UPLOAD_MAX_BYTES / 1024 / 1024} MB (${file.originalname}).`,
        );
      }

      assertAllowedMime(file.mimetype ?? 'application/octet-stream');

      const storageKey = makeStorageKey(ticketId, file.originalname ?? 'file');
      const buf = file.buffer ?? Buffer.alloc(0);
      if (!buf.length) {
        throw new BadRequestException(`Brak treści pliku (${file.originalname}).`);
      }
      const safeOriginal = sanitizeOriginalFilename(file.originalname ?? '');

      // Upload to MinIO BEFORE creating the DB row — if storage is down we
      // don't want orphaned DB rows pointing to a missing object. If the
      // DB insert fails AFTER upload we'll have an orphaned object, but a
      // periodic reconciler (storage:reconcile-orphans, future task) can
      // clean those up and they don't break correctness.
      await this.storage.putObject(ObjectBuckets.TICKET_ATTACHMENTS, storageKey, buf, {
        contentType: file.mimetype ?? 'application/octet-stream',
        originalFilename: safeOriginal,
        custom: {
          ticketid: ticketId,
          uploaderid: uploadedById,
        },
      });

      await this.prisma.ticketAttachment.create({
        data: {
          ticketId,
          replyId,
          uploadedById,
          mimeType: file.mimetype ?? 'application/octet-stream',
          sizeBytes: file.size,
          originalName: safeOriginal,
          storageKey,
        },
      });
      total += 1;
    }
  }

  async clientReplyWithFiles(
    ticketId: string,
    userId: string,
    message: string,
    files: Express.Multer.File[] | undefined,
  ) {
    const dto: AddTicketReplyDto = { message };
    if (!files?.length) {
      return this.addReply(ticketId, userId, dto);
    }
    if (files.length > TICKET_UPLOAD_MAX_FILES_PER_BATCH) {
      throw new BadRequestException(`Maksymalnie ${TICKET_UPLOAD_MAX_FILES_PER_BATCH} plików naraz.`);
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Zgłoszenie nie zostało znalezione');
    if (ticket.userId !== userId) throw new ForbiddenException('Brak dostępu');

    const [reply] = await this.prisma.$transaction([
      this.prisma.ticketReply.create({
        data: {
          message: dto.message,
          ticketId,
          authorId: userId,
          isStaff: false,
        },
      }),
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'OPEN',
          resolvedAt: null,
          waitingSince: null,
          customerReminderSentAt: null,
          autoClosedAt: null,
          lastReplyAt: new Date(),
          lastReplyIsStaff: false,
        },
      }),
    ]);

    await this.saveAttachmentFiles({
      ticketId,
      replyId: reply.id,
      uploadedById: userId,
      files,
    });

    const full = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { email: true } }, assignedTo: { select: { email: true } } },
    });
    if (full) {
      await this.logEvent(ticketId, 'CUSTOMER_REPLY', full.userId);
      if (full.assignedToId) {
        await this.notifyStaff(full.assignedToId, {
          title: 'Nowa wiadomość od klienta',
          body: `#${ticketId.slice(0, 8)} — ${full.subject}`,
          link: `/tickets/${ticketId}`,
        });
      }
    }
    if (full?.assignedTo?.email) {
      this.notifyClientReplyToStaff(ticketId, full.subject, dto.message, full.assignedTo.email);
    }

    return reply;
  }

  async staffReplyWithFiles(ticketId: string, staffId: string, message: string, files?: Express.Multer.File[]) {
    const dto: AddTicketReplyDto = { message };
    if (!files?.length) {
      return this.adminAddReply(ticketId, staffId, dto);
    }
    if (files.length > TICKET_UPLOAD_MAX_FILES_PER_BATCH) {
      throw new BadRequestException(`Maksymalnie ${TICKET_UPLOAD_MAX_FILES_PER_BATCH} plików naraz.`);
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const dataToUpdate: Record<string, unknown> = {
      status: 'WAITING_CUSTOMER',
      waitingSince: new Date(),
      customerReminderSentAt: null,
      autoClosedAt: null,
      lastReplyAt: new Date(),
      lastReplyIsStaff: true,
    };
    if (!ticket.firstResponseAt) {
      dataToUpdate['firstResponseAt'] = new Date();
    }

    const [reply] = await this.prisma.$transaction([
      this.prisma.ticketReply.create({
        data: {
          message: dto.message,
          ticketId,
          authorId: staffId,
          isStaff: true,
        },
      }),
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: dataToUpdate,
      }),
    ]);

    await this.saveAttachmentFiles({
      ticketId,
      replyId: reply.id,
      uploadedById: staffId,
      files,
    });

    const full = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { email: true } } },
    });
    if (full) {
      await this.logEvent(ticketId, 'STAFF_REPLY', staffId);
    }
    if (full?.user?.email) {
      this.notifyStaffReplyToClient(ticketId, full.subject, dto.message, full.user.email);
    }

    return reply;
  }

  async getAttachmentForDownload(
    ticketId: string,
    attachmentId: string,
    userId: string,
    role: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { userId: true },
    });
    if (!ticket) throw new NotFoundException('Zgłoszenie nie zostało znalezione');
    const isStaffOrAdmin = ['STAFF', 'ADMIN'].includes(role);
    if (!isStaffOrAdmin && ticket.userId !== userId) {
      throw new ForbiddenException('Brak dostępu');
    }

    const att = await this.prisma.ticketAttachment.findFirst({
      where: { id: attachmentId, ticketId },
    });
    if (!att) throw new NotFoundException('Załącznik nie został znaleziony');

    return att;
  }

  /**
   * Streams a ticket attachment from MinIO. Replaces the previous
   * `attachmentAbsolutePath` helper which read directly from local FS.
   * Returns a `Readable` that the controller can wrap in `StreamableFile`.
   */
  async openAttachmentStream(storageKey: string): Promise<Readable> {
    return this.storage.getObjectStream(ObjectBuckets.TICKET_ATTACHMENTS, storageKey);
  }

  /**
   * Permanently removes the underlying object. Called by the moderation
   * tooling and by user account anonymization (RODO art. 17). Idempotent:
   * a missing object is not an error. The DB row is dropped by the caller.
   */
  async removeAttachmentObject(storageKey: string): Promise<void> {
    try {
      await this.storage.removeObject(ObjectBuckets.TICKET_ATTACHMENTS, storageKey);
    } catch {
      // Swallow — caller is removing the DB row regardless.
    }
  }

  private clientPanelBaseUrl(): string {
    return (this.config.get<string>('clientPanelUrl') ?? 'http://localhost:3001').replace(/\/$/, '');
  }

  private staffPanelBaseUrl(): string {
    return (
      this.config.get<string>('STAFF_PANEL_URL') ??
      this.config.get<string>('staffPanelUrl') ??
      this.clientPanelBaseUrl()
    ).replace(/\/$/, '');
  }

  private notifyClientReplyToStaff(
    ticketId: string,
    subject: string,
    excerpt: string,
    staffEmail: string,
  ): void {
    void this.mailer
      .send({
        ...ticketReplyNotificationTemplate({
          to: staffEmail,
          ticketId,
          subject,
          excerpt,
          panelUrl: this.clientPanelBaseUrl(),
          staffPanelUrl: this.staffPanelBaseUrl(),
          isFromStaff: false,
        }),
        category: 'TRANSACTIONAL',
        fromRole: 'NOREPLY',
      })
      .catch(() => undefined);
  }

  private notifyStaffReplyToClient(
    ticketId: string,
    subject: string,
    excerpt: string,
    clientEmail: string,
  ): void {
    void this.mailer
      .send({
        ...ticketReplyNotificationTemplate({
          to: clientEmail,
          ticketId,
          subject,
          excerpt,
          panelUrl: this.clientPanelBaseUrl(),
          isFromStaff: true,
        }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch(() => undefined);
  }
}

function computeSlaResponseDueAt(priority: string): Date {
  const hours = priority === 'URGENT' ? 1 : priority === 'HIGH' ? 4 : priority === 'NORMAL' ? 12 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function computeSlaResolveDueAt(priority: string): Date {
  const hours = priority === 'URGENT' ? 8 : priority === 'HIGH' ? 24 : priority === 'NORMAL' ? 72 : 120;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}


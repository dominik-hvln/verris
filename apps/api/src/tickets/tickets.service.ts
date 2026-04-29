import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import {
  newTicketCreatedTemplate,
  ticketStatusChangedTemplate,
} from '../mail/templates/ticket-notifications';
import {
  assertAllowedMime,
  makeStorageKey,
  sanitizeOriginalFilename,
  writeAttachmentFile,
  TICKET_MAX_ATTACHMENTS_PER_TICKET,
  TICKET_UPLOAD_MAX_BYTES,
  TICKET_UPLOAD_MAX_FILES_PER_BATCH,
} from './ticket-attachment.utils';
import { CreateTicketDto, AddTicketReplyDto } from './tickets.dto';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

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

    const row = await this.prisma.ticket.create({
      data: {
        subject: dto.subject,
        message: dto.message,
        priority: dto.priority || 'NORMAL',
        department: dto.department || 'TECHNICAL',
        userId,
        assignedToId,
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
          subject: `[EkoHost] Nowe zgłoszenie: ${row.subject}`,
          text: `Przypisano Ci nowe zgłoszenie (#${row.id}).\n\n${row.message}\n\n— Panel: ${clientUrl}/dashboard/support`,
          tag: 'ticket.created',
        })
        .catch(() => undefined);
    }

    void this.mailer
      .send(
        newTicketCreatedTemplate({
          ticketId: row.id,
          subject: row.subject,
          customerEmail: row.user.email,
          panelUrl: clientUrl,
        }),
      )
      .catch(() => undefined);

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

    return ticket;
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
        data: { status: 'OPEN', resolvedAt: null }, // Reopen if they reply
      }),
    ]);

    const full = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { email: true } },
        assignedTo: { select: { email: true } },
      },
    });
    if (full?.assignedTo?.email) {
      void this.mailer
        .send({
          to: full.assignedTo.email,
          subject: `[EkoHost] Nowa wiadomość od klienta — #${ticketId}`,
          text: full.subject + '\n\n' + dto.message,
          tag: 'ticket.reply.client',
        })
        .catch(() => undefined);
    }

    return reply;
  }

  // --- ADMIN & STAFF METHODS ---

  async adminFindAll() {
    return this.prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, companyName: true },
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

  async adminUpdateTicket(ticketId: string, dto: any) {
    const existing = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { email: true } } },
    });
    if (!existing) throw new NotFoundException('Ticket not found');

    const dataToUpdate: any = { ...dto };
    if (dto.status === 'CLOSED') {
      dataToUpdate.resolvedAt = new Date();
    }
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: dataToUpdate,
    });

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
        .send(
          ticketStatusChangedTemplate({
            ticketId,
            subject: updated.subject,
            customerEmail: existing.user.email,
            panelUrl: clientUrl,
            newStatus: newLabel,
          }),
        )
        .catch(() => undefined);
    }

    return updated;
  }

  async adminAddReply(ticketId: string, staffId: string, dto: AddTicketReplyDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const dataToUpdate: any = { status: 'IN_PROGRESS' };
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
    if (full?.user?.email) {
      void this.mailer
        .send({
          to: full.user.email,
          subject: `[EkoHost] Odpowiedź do zgłoszenia: ${full.subject}`,
          text: dto.message,
          tag: 'ticket.reply.staff',
        })
        .catch(() => undefined);
    }

    return reply;
  }

  async getCannedResponses() {
    return this.prisma.cannedResponse.findMany({
      orderBy: { title: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Załączniki (E‑4)
  // ---------------------------------------------------------------------------

  private getTicketUploadRoot(): string {
    const env = process.env.TICKET_UPLOAD_DIR?.trim();
    return env && env.length > 0 ? env : join(process.cwd(), 'uploads', 'tickets');
  }

  /**
   * multipart: subject, message, opcja priority/department + pola `files`.
   * Bez plików zachowuje się jak zwykłe create (JSON).
   */
  async createWithOptionalFiles(
    userId: string,
    fields: { subject: string; message: string; priority?: string; department?: string },
    files?: Express.Multer.File[] | null,
  ) {
    const dto: CreateTicketDto = {
      subject: fields.subject,
      message: fields.message,
      priority: (fields.priority as CreateTicketDto['priority']) ?? 'NORMAL',
      department: (fields.department as CreateTicketDto['department']) ?? 'TECHNICAL',
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
    const uploadRoot = this.getTicketUploadRoot();
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
      await writeAttachmentFile(uploadRoot, storageKey, buf);

      await this.prisma.ticketAttachment.create({
        data: {
          ticketId,
          replyId,
          uploadedById,
          mimeType: file.mimetype ?? 'application/octet-stream',
          sizeBytes: file.size,
          originalName: sanitizeOriginalFilename(file.originalname ?? ''),
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
        data: { status: 'OPEN', resolvedAt: null },
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
    if (full?.assignedTo?.email) {
      void this.mailer
        .send({
          to: full.assignedTo.email,
          subject: `[EkoHost] Nowa wiadomość od klienta — #${ticketId}`,
          text: full.subject + '\n\n' + dto.message,
          tag: 'ticket.reply.client',
        })
        .catch(() => undefined);
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

    const dataToUpdate: Record<string, unknown> = { status: 'IN_PROGRESS' };
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
    if (full?.user?.email) {
      void this.mailer
        .send({
          to: full.user.email,
          subject: `[EkoHost] Odpowiedź do zgłoszenia: ${full.subject}`,
          text: dto.message,
          tag: 'ticket.reply.staff',
        })
        .catch(() => undefined);
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

  attachmentAbsolutePath(storageKey: string): string {
    return join(this.getTicketUploadRoot(), storageKey);
  }
}


import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { opcjeUploaduDoPamieci } from '../common/upload/multer-limity.js';
import { TicketsService } from './tickets.service.js';
import {
  TICKET_UPLOAD_MAX_BYTES,
  TICKET_UPLOAD_MAX_FILES_PER_BATCH,
} from './ticket-attachment.utils.js';
import {
  CreateTicketDto,
  AddTicketReplyDto,
  AdminUpdateTicketDto,
  SubmitCsatDto,
  CannedResponseDto,
  EskalacjaZgloszeniaDto,
  RunbookZgloszeniaDto,
  RyzykoZgloszeniaDto,
  ZmianaSzablonuDto,
} from './tickets.dto.js';
import { CannedResponseService } from './canned-response.service.js';
import { TicketContextService } from './ticket-context.service.js';
import { OpiekaZgloszenService } from './opieka-zgloszen.service.js';
import { renderTemplate } from './ticket-context.js';
import { Delete, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';

// SEC-07 — limity multipartu pochodzą z jednego miejsca, razem z fieldArrayIndexLimit.
const FILES_MEMORY = FilesInterceptor(
  'files',
  TICKET_UPLOAD_MAX_FILES_PER_BATCH,
  opcjeUploaduDoPamieci(TICKET_UPLOAD_MAX_BYTES),
);

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly canned: CannedResponseService,
    private readonly context: TicketContextService,
    private readonly opieka: OpiekaZgloszenService,
  ) {}

  // SUP-2 — szablony odpowiedzi (staff: lista; admin: CRUD).
  @Get('canned')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_VIEW')
  async cannedList(@Query('topic') topic?: string, @Query('q') q?: string, @Query('ticketId') ticketId?: string) {
    const rows = await this.canned.listForStaff(topic, q);
    // PB-18 — z ticketId szablony przychodzą z podstawionymi zmiennymi tego zgłoszenia.
    if (!ticketId || !/^[0-9a-f-]{36}$/i.test(ticketId)) return rows;
    const vars = await this.context.varsFor(ticketId);
    return rows.map((r) => ({ ...r, content: renderTemplate(r.content, vars) }));
  }

  @Get('canned/all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  cannedAll() {
    return this.canned.listAll();
  }

  @Post('canned')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  cannedCreate(@CurrentUser() user: { userId: string }, @Body() dto: CannedResponseDto) {
    return this.canned.create(dto, user.userId);
  }

  @Patch('canned/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  cannedUpdate(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ZmianaSzablonuDto,
  ) {
    return this.canned.update(id, dto, user.userId);
  }

  @Delete('canned/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(200)
  cannedDelete(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.canned.remove(id, user.userId);
  }

  @Post()
  async create(@CurrentUser() user: { userId: string }, @Body() dto: CreateTicketDto) {
    return await this.ticketsService.create(user.userId, dto);
  }

  /** multipart: subject, message, priority?, department?, files[] */
  @Post('with-attachments')
  @UseInterceptors(FILES_MEMORY)
  async createWithAttachments(
    @CurrentUser() user: { userId: string },
    // Pola multipart przechodzą przez ten sam DTO co JSON — wcześniej `@Body('pole')` omijało walidację.
    @Body() dto: CreateTicketDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.ticketsService.createWithOptionalFiles(user.userId, dto, files);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_VIEW')
  async adminFindAll(@Query('userId') userId?: string) {
    return this.ticketsService.adminFindAll(userId);
  }

  @Get('admin/canned-responses')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_VIEW')
  async getCannedResponses() {
    return this.ticketsService.getCannedResponses();
  }

  // PB-18 — podgląd klienta, klasyfikacja i szkic odpowiedzi (tylko odczyt).
  @Get('admin/:id/context')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_VIEW')
  adminTicketContext(@Param('id', ParseUUIDPipe) id: string) {
    return this.context.contextFor(id);
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_VIEW')
  async adminFindOne(@Param('id') id: string, @CurrentUser() user: { userId: string }): Promise<unknown> {
    return this.ticketsService.adminFindOne(id, user.userId);
  }

  @Patch('admin/:id')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_MANAGE')
  async adminUpdateTicket(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: AdminUpdateTicketDto,
  ) {
    return this.ticketsService.adminUpdateTicket(id, dto, user.userId);
  }

  @Post('admin/:id/escalate')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_MANAGE')
  async adminEscalateTicket(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: EskalacjaZgloszeniaDto,
  ) {
    return this.ticketsService.adminEscalateTicket(id, user.userId, body.reason ?? '');
  }

  @Post('admin/:id/runbook')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_MANAGE')
  async adminApplyRunbook(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: RunbookZgloszeniaDto,
  ) {
    return this.ticketsService.adminApplyRunbook(id, user.userId, body.runbookKey ?? '');
  }

  @Post('admin/:id/risk')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_MANAGE')
  async adminSetRiskFlag(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: RyzykoZgloszeniaDto,
  ) {
    return this.ticketsService.adminSetRiskFlag(
      id,
      user.userId,
      body.riskFlag ?? null,
      body.riskReason ?? null,
    );
  }

  @Post('admin/:id/replies')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_MANAGE')
  async adminAddReply(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: AddTicketReplyDto,
  ) {
    return this.ticketsService.adminAddReply(id, user.userId, dto);
  }

  @Post('admin/:id/replies/with-files')
  @UseGuards(RolesGuard, StaffPermissionsGuard)
  @Roles('STAFF', 'ADMIN')
  @StaffPerm('TICKETS_MANAGE')
  @UseInterceptors(FILES_MEMORY)
  async adminAddReplyWithFiles(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
    @Body() { message, czekaj }: AddTicketReplyDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.ticketsService.staffReplyWithFiles(id, user.userId, message, files, czekaj);
  }

  @Get()
  async findAll(@CurrentUser() user: { userId: string }) {
    return this.ticketsService.findAllByUser(user.userId);
  }

  @Post(':ticketId/attachments')
  @UseInterceptors(FILES_MEMORY)
  async addOpeningAttachments(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: { userId: string },
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.ticketsService.addOpeningAttachments(ticketId, user.userId, files ?? []);
  }

  @Post(':ticketId/replies/with-files')
  @UseInterceptors(FILES_MEMORY)
  async clientReplyWithFiles(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: { userId: string },
    @Body() { message }: AddTicketReplyDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.ticketsService.clientReplyWithFiles(ticketId, user.userId, message, files);
  }

  @Get(':ticketId/attachments/:attachmentId/file')
  async downloadAttachment(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    const att = await this.ticketsService.getAttachmentForDownload(
      ticketId,
      attachmentId,
      user.userId,
      user.role,
    );
    const stream = await this.ticketsService.openAttachmentStream(att.storageKey);
    return new StreamableFile(stream, {
      type: att.mimeType,
      disposition: `attachment; filename="${encodeURIComponent(att.originalName)}"`,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.ticketsService.findOne(id, user.userId);
  }

  @Post(':id/replies')
  async addReply(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: AddTicketReplyDto,
  ) {
    return this.ticketsService.addReply(id, user.userId, dto);
  }

  // SUP-4 — ocena wsparcia po zamknięciu zgłoszenia.
  @Post(':id/csat')
  async submitCsat(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: SubmitCsatDto,
  ) {
    return this.ticketsService.submitCsat(id, user.userId, dto.rating, dto.comment, {
      agentRating: dto.agentRating,
      resolved: dto.resolved,
    });
  }

  // PB-37 — „Otwórz ponownie” (do 7 dni od zamknięcia).
  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.opieka.otworzPonownie(id, user.userId);
  }
}

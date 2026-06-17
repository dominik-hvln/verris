import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TicketsService } from './tickets.service';
import {
  TICKET_UPLOAD_MAX_BYTES,
  TICKET_UPLOAD_MAX_FILES_PER_BATCH,
} from './ticket-attachment.utils';
import {
  CreateTicketDto,
  AddTicketReplyDto,
  AdminUpdateTicketDto,
  SubmitCsatDto,
  CannedResponseDto,
} from './tickets.dto';
import { CannedResponseService } from './canned-response.service';
import { Delete, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

const FILES_MEMORY = FilesInterceptor('files', TICKET_UPLOAD_MAX_FILES_PER_BATCH, {
  storage: memoryStorage(),
  limits: { fileSize: TICKET_UPLOAD_MAX_BYTES },
});

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly canned: CannedResponseService,
  ) {}

  // SUP-2 — szablony odpowiedzi (staff: lista; admin: CRUD).
  @Get('canned')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  cannedList(@Query('topic') topic?: string) {
    return this.canned.listForStaff(topic);
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
    @Body() dto: Partial<CannedResponseDto>,
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
    @Body('subject') subject: string,
    @Body('message') message: string,
    @Body('priority') priority?: string,
    @Body('department') department?: string,
    @Body('topic') topic?: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.ticketsService.createWithOptionalFiles(
      user.userId,
      { subject, message, priority, department, topic },
      files,
    );
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async adminFindAll(@Query('userId') userId?: string) {
    return this.ticketsService.adminFindAll(userId);
  }

  @Get('admin/canned-responses')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async getCannedResponses() {
    return this.ticketsService.getCannedResponses();
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async adminFindOne(@Param('id') id: string): Promise<unknown> {
    return this.ticketsService.adminFindOne(id);
  }

  @Patch('admin/:id')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async adminUpdateTicket(@Param('id') id: string, @Body() dto: AdminUpdateTicketDto) {
    return this.ticketsService.adminUpdateTicket(id, dto);
  }

  @Post('admin/:id/escalate')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async adminEscalateTicket(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { reason: string },
  ) {
    return this.ticketsService.adminEscalateTicket(id, user.userId, body.reason ?? '');
  }

  @Post('admin/:id/runbook')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async adminApplyRunbook(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { runbookKey: string },
  ) {
    return this.ticketsService.adminApplyRunbook(id, user.userId, body.runbookKey ?? '');
  }

  @Post('admin/:id/risk')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async adminSetRiskFlag(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { riskFlag?: string | null; riskReason?: string | null },
  ) {
    return this.ticketsService.adminSetRiskFlag(
      id,
      user.userId,
      body.riskFlag ?? null,
      body.riskReason ?? null,
    );
  }

  @Post('admin/:id/replies')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async adminAddReply(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: AddTicketReplyDto,
  ) {
    return this.ticketsService.adminAddReply(id, user.userId, dto);
  }

  @Post('admin/:id/replies/with-files')
  @UseGuards(RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @UseInterceptors(FILES_MEMORY)
  async adminAddReplyWithFiles(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
    @Body('message') message: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.ticketsService.staffReplyWithFiles(id, user.userId, message, files);
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
    @Body('message') message: string,
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
    return this.ticketsService.submitCsat(id, user.userId, dto.rating, dto.comment);
  }
}

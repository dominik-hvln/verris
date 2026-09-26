import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { MailSettingsService } from './mail-settings.service.js';
import { MailerService } from './mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TestMailSettingsDto,
  UpdateMailSettingsDto,
} from './dto/mail-settings.dto.js';

@Controller('admin/mail-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MailSettingsAdminController {
  constructor(
    private readonly mailSettings: MailSettingsService,
    private readonly mailer: MailerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HttpCode(200)
  getSettings() {
    return this.mailSettings.getAdminSettings();
  }

  @Patch()
  @HttpCode(200)
  updateSettings(
    @Body() dto: UpdateMailSettingsDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.mailSettings.updateAdminSettings(dto, actor.userId);
  }

  @Post('test')
  @HttpCode(200)
  async sendTest(
    @Body() dto: TestMailSettingsDto,
    @CurrentUser() actor: { userId: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { email: true },
    });
    const to = dto.to?.trim() || user?.email;
    if (!to) {
      return { ok: false, error: 'Brak adresu docelowego.' };
    }

    const result = await this.mailer.send({
      to,
      subject: 'Verris — test wysyłki SMTP',
      text:
        'To jest testowa wiadomość z panelu admina Verris. Jeśli ją widzisz, konfiguracja SMTP działa.',
      html: '<p>To jest <strong>testowa wiadomość</strong> z panelu admina Verris.</p>',
      tag: 'admin_smtp_test',
      category: 'TRANSACTIONAL',
      userId: actor.userId,
    });

    return {
      ok: result.delivered,
      to,
      providerId: result.providerId,
      messageId: result.messageId,
      emailLogId: result.emailLogId,
    };
  }
}

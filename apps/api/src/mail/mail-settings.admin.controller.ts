import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MailSettingsService } from './mail-settings.service';
import { MailerService } from './mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TestMailSettingsDto,
  UpdateMailSettingsDto,
} from './dto/mail-settings.dto';

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

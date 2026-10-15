import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@verris/database';
import { IsInt, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { KsefService } from './ksef.service.js';

export class ZakolejkujZalegleDto {
  /** Liczba z podglądu — musi zgadzać się z bieżącą. */
  @IsInt()
  @Min(1)
  @Max(100000)
  oczekiwanaLiczba!: number;
}

/** Admin: stan integracji KSeF 2.0, retry odrzuconych, pobieranie UPO. */
@Controller('admin/ksef')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KsefAdminController {
  constructor(private readonly ksef: KsefService) {}

  @Get('overview')
  overview() {
    return this.ksef.adminOverview();
  }

  /** Faktury VAT sprzed okna automatu, których nie ma w kolejce KSeF (podgląd przed zakolejkowaniem). */
  @Get('zalegle')
  zalegle() {
    return this.ksef.zalegleDoKsef();
  }

  @Post('zalegle')
  @HttpCode(200)
  zakolejkujZalegle(@Body() body: ZakolejkujZalegleDto, @CurrentUser() user: { userId: string }) {
    return this.ksef.zakwalifikujZalegle(user.userId, body.oczekiwanaLiczba);
  }

  @Post('invoices/:id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.ksef.retryInvoice(id, user.userId);
  }

  /** UPO faktury (XML XAdES podpisany przez MF) — do pobrania/archiwizacji. */
  @Get('invoices/:id/upo')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async upo(@Param('id') id: string, @CurrentUser() user: { userId: string }): Promise<string> {
    try {
      const { upoXml } = await this.ksef.downloadUpo(id, user.userId);
      return upoXml;
    } catch (err) {
      throw new NotFoundException(err instanceof Error ? err.message : 'UPO niedostępne.');
    }
  }
}

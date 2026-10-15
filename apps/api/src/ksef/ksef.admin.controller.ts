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
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

export class WyjasnijFaktureDto {
  /** Sprawdzone w KSeF: faktura tam jest (true) albo jej nie ma (false). */
  @IsBoolean()
  jestWKsef!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numerKsef?: string;
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

  /** Decyzja 15.10 (#3): rozstrzygnięcie faktury „do wyjaśnienia” (wysyłka bez odpowiedzi KSeF). */
  @Post('invoices/:id/wyjasnij')
  @HttpCode(200)
  wyjasnij(@Param('id') id: string, @Body() body: WyjasnijFaktureDto, @CurrentUser() user: { userId: string }) {
    return this.ksef.wyjasnijFakture(id, user.userId, body);
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

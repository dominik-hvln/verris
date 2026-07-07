import {
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { KsefService } from './ksef.service';

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

  @Post('invoices/:id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.ksef.retryInvoice(id, user.userId);
  }

  /** UPO faktury (XML XAdES podpisany przez MF) — do pobrania/archiwizacji. */
  @Get('invoices/:id/upo')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async upo(@Param('id') id: string): Promise<string> {
    try {
      const { upoXml } = await this.ksef.downloadUpo(id);
      return upoXml;
    } catch (err) {
      throw new NotFoundException(err instanceof Error ? err.message : 'UPO niedostępne.');
    }
  }
}

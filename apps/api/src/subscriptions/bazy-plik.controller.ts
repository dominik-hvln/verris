import { Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { opcjeUploaduDoPamieci } from '../common/upload/multer-limity.js';
import { DbTransferService, MAX_PLIKU_BAZY } from './db-transfer.service.js';

/**
 * Paczka 129 — wgranie pliku .sql/.sql.gz do importu prosto z zakładki „Bazy danych” (do ~/verris-bazy).
 * Osobny kontroler, żeby nie dokładać multipartu do UserServicesController. Uprawnienia subkont: trasa zawiera
 * „hosting-db-transfer” → FILES_MANAGE (customer-permissions.guard.ts), jak eksport/import baz.
 */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class BazyPlikController {
  constructor(private readonly dbTransfer: DbTransferService) {}

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:db-upload' })
  @Post(':id/hosting-db-transfer/upload')
  @UseInterceptors(FileInterceptor('file', opcjeUploaduDoPamieci(MAX_PLIKU_BAZY)))
  wgraj(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.dbTransfer.wgrajPlik(id, user.userId, file?.originalname, file?.buffer);
  }
}

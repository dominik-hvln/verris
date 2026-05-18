import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DpaPdfService } from './dpa-pdf.service';

/**
 * GET /me/dpa.pdf
 *
 * Generates a personalized DPA PDF on demand. The PDF embeds the client's
 * company data (NIP, address, e-mail, contact person) and the timestamp of
 * their acceptance — useful as a tangible artifact for B2B audits.
 *
 * Authentication: JWT (`@UseGuards(JwtAuthGuard)`). The PDF is gated on the
 * existence of a `UserConsent` row with `documentKind=DPA` for the current
 * version (enforced inside `DpaPdfService.buildPdfForUser`).
 */
@Controller()
export class DpaController {
  constructor(private readonly pdf: DpaPdfService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/dpa.pdf')
  @Header('Cache-Control', 'no-store, max-age=0')
  async download(@CurrentUser() user: { userId: string }, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.pdf.buildPdfForUser(user.userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }
}

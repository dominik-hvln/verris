import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { InvoicesService } from './invoices.service.js';
import { ProformaService } from './proforma.service.js';

@Controller('billing/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly proforma: ProformaService,
  ) {}

  /** M-24 — proforma na najbliższe odnowienie usługi (PDF na żądanie, niczego nie zapisuje). */
  @Get('proforma/:subscriptionId')
  @Header('Cache-Control', 'no-store')
  async proformaPdf(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf, filename } = await this.proforma.render(user.userId, subscriptionId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(Buffer.from(pdf));
  }

  @Get()
  @HttpCode(200)
  list(
    @CurrentUser() user: { userId: string },
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.invoices.listForUser(user.userId, { limit, offset });
  }

  @Get(':id')
  @HttpCode(200)
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.invoices.getForUser(user.userId, id);
  }

  /**
   * Streams the Verris-issued PDF directly from MinIO. Auth required —
   * we never expose presigned URLs publicly because invoices are sensitive
   * (full names, addresses, NIP). Output is a regular `application/pdf`
   * response with `Content-Disposition: attachment` so the browser triggers
   * download instead of in-page rendering.
   */
  @Get(':id/pdf')
  @Header('Cache-Control', 'no-store')
  async pdf(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
    @Query('duplikat') duplikat?: string,
  ): Promise<void> {
    if (duplikat === '1') {
      const d = await this.invoices.renderDuplicate(user.userId, id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${d.filename}"`);
      res.end(Buffer.from(d.pdf));
      return;
    }
    const { stream, filename } = await this.invoices.openPdfStream(user.userId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', (err) => res.destroy(err));
    stream.pipe(res);
  }
}

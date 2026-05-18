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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InvoicesService } from './invoices.service';

@Controller('billing/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

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
  ): Promise<void> {
    const { stream, filename } = await this.invoices.openPdfStream(user.userId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', (err) => res.destroy(err));
    stream.pipe(res);
  }
}

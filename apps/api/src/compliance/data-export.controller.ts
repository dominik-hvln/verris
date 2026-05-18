import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractRequestContext } from '../common/decorators/request-context';
import { DataExportService } from './data-export.service';

/**
 * GDPR Art. 20 — data subject access request endpoints (Sprint 1, L-06).
 *
 *  - `POST /me/data-export`               — request a new export.
 *  - `GET  /me/data-export`               — list previous + active requests.
 *  - `GET  /me/data-export/download/:token` — single-use download link.
 *
 * The download endpoint is auth-less by design (token-based) so the email
 * link can be opened from any device. Token is single-token-per-row and
 * expires after 7 days.
 */
@Controller()
export class DataExportController {
  constructor(private readonly service: DataExportService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/data-export')
  list(@CurrentUser() user: { userId: string }) {
    return this.service.listForUser(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/data-export')
  @HttpCode(HttpStatus.CREATED)
  request(@CurrentUser() user: { userId: string }, @Req() req: Request) {
    return this.service.request(user.userId, extractRequestContext(req));
  }

  @Get('me/data-export/download/:token')
  @Header('Cache-Control', 'no-store')
  async download(@Param('token') token: string, @Res() res: Response) {
    const { stream, filename } = await this.service.openDownloadStream(token);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Stream directly from MinIO → HTTP response. No buffering in API RAM,
    // even for large multi-GB exports.
    stream.on('error', (err) => {
      // If the upstream errors mid-flight we can't change status (headers
      // already flushed); destroy the response so the client sees a
      // truncated stream rather than waiting forever.
      res.destroy(err);
    });
    stream.pipe(res);
  }
}

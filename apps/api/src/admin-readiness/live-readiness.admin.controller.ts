import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LiveReadinessService } from './live-readiness.service.js';

@Controller('admin/live-readiness')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class LiveReadinessAdminController {
  constructor(
    private readonly readiness: LiveReadinessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HttpCode(200)
  get() {
    return this.readiness.report();
  }

  /**
   * H-20 — historia prób odtworzenia z kopii.
   *
   * Osobny endpoint, a nie pole w raporcie gotowości, bo to są dwie różne
   * rzeczy: raport mówi „czy wolno startować", historia mówi „co się działo".
   * Przy awarii potrzebna jest ta druga, a wtedy nikt nie będzie jej szukał
   * w polu obok flagi go/no-go.
   */
  @Get('proby-odtworzenia')
  async probyOdtworzenia() {
    const rows = await this.prisma.restoreDrill.findMany({
      orderBy: { finishedAt: 'desc' },
      take: 50,
    });
    return rows.map((p) => ({
      id: p.id,
      finishedAt: p.finishedAt,
      durationSec: p.durationSec,
      result: p.result,
      objectName: p.objectName,
      source: p.source,
      owner: p.owner,
      notes: p.notes,
      rowCounts: p.rowCounts,
    }));
  }

}

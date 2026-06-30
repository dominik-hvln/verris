import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProvisioningQueueService } from './provisioning-queue.service';

const ALLOWED_STATES = ['active', 'waiting', 'delayed', 'failed', 'completed'] as const;
type AllowedState = (typeof ALLOWED_STATES)[number];

@Controller('admin/provisioning-queue')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('PROVISIONING_MANAGE')
export class ProvisioningQueueAdminController {
  constructor(private readonly queue: ProvisioningQueueService) {}

  @Get()
  @HttpCode(200)
  async list(@Query('state') state?: string) {
    let parsed: AllowedState | undefined;
    if (state) {
      const lower = state.toLowerCase();
      if (!ALLOWED_STATES.includes(lower as AllowedState)) {
        throw new BadRequestException(
          `Niepoprawny stan kolejki: "${state}". Dozwolone: ${ALLOWED_STATES.join(', ')}.`,
        );
      }
      parsed = lower as AllowedState;
    }
    if (!this.queue.isAsync()) {
      return {
        async: false,
        message: 'Kolejka pracuje synchronicznie (REDIS_URL nie ustawione).',
        counts: {},
        rows: [],
      };
    }
    return {
      async: true,
      ...(await this.queue.listJobs({ state: parsed })),
    };
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retry(
    @Param('id') id: string,
    @CurrentUser() actor: { userId: string },
    @Body() body: { reason?: string },
  ) {
    if (!this.queue.isAsync()) {
      throw new BadRequestException('Brak Redisa — retry niedostępne (sync mode).');
    }
    const reason = body.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Powód retry jest wymagany dla audytu.');
    }
    const res = await this.queue.retryJob(id, {
      actorUserId: actor.userId,
      reason,
    });
    if (!res.ok) throw new BadRequestException(`Job ${id} nie istnieje.`);
    return res;
  }
}

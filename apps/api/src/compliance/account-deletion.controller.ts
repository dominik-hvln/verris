import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractRequestContext } from '../common/decorators/request-context';
import { AccountDeletionService } from './account-deletion.service';

class RequestDeletionDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

/**
 * GDPR Art. 17 — right to be forgotten endpoints (Sprint 1, L-07).
 *
 *  - `GET    /me/account-deletion`     — current status (active? scheduled?).
 *  - `POST   /me/account-deletion`     — request deletion, requires password.
 *  - `DELETE /me/account-deletion`     — cancel pending deletion.
 */
@Controller('me/account-deletion')
@UseGuards(JwtAuthGuard)
export class AccountDeletionController {
  constructor(private readonly service: AccountDeletionService) {}

  @Get()
  status(@CurrentUser() user: { userId: string }) {
    return this.service.getStatusForUser(user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  request(
    @CurrentUser() user: { userId: string },
    @Body() dto: RequestDeletionDto,
    @Req() req: Request,
  ) {
    return this.service.request({
      userId: user.userId,
      password: dto.password,
      reason: dto.reason,
      ctx: extractRequestContext(req),
    });
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: { userId: string }, @Req() req: Request) {
    await this.service.cancel(user.userId, extractRequestContext(req));
    return { ok: true };
  }
}

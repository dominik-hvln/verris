import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTokensService } from './api-tokens.service';
import { API_SCOPE_LABELS, ALL_API_SCOPES, UPRAWNIENIE_ZAKRESU, isValidScope } from './api-scopes';

class CreateApiTokenDto {
  @IsString() @MinLength(2) @MaxLength(60)
  name!: string;

  @IsArray() @IsString({ each: true })
  scopes!: string[];

  @IsOptional() @IsInt() @Min(1) @Max(3650)
  expiresInDays?: number;
}

/** Zarządzanie tokenami API z poziomu panelu klienta (uwierzytelnianie JWT). */
@Controller('users/me/api-tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get('scopes')
  scopes() {
    return ALL_API_SCOPES.map((s) => ({ value: s, label: API_SCOPE_LABELS[s] }));
  }

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.tokens.list(user.userId);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: { userId: string; customerOwnerId?: string | null; customerPermissions?: string[] },
    @Body() dto: CreateApiTokenDto,
  ) {
    if (user.customerOwnerId) {
      const ma = new Set(user.customerPermissions ?? []);
      const brak = dto.scopes.filter((z) => isValidScope(z) && !ma.has(UPRAWNIENIE_ZAKRESU[z]));
      if (brak.length) {
        throw new ForbiddenException(`Subkonto nie może nadać tokenowi zakresu, do którego samo nie ma uprawnienia: ${brak.join(', ')}.`);
      }
    }
    return this.tokens.create(user.userId, { name: dto.name, scopes: dto.scopes, expiresInDays: dto.expiresInDays ?? null });
  }

  @Delete(':id')
  @HttpCode(200)
  async revoke(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    await this.tokens.revoke(user.userId, id);
    return { ok: true };
  }
}

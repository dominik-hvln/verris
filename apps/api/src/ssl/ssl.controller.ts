import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { SslService } from './ssl.service.js';

export class ZamowSslDto {
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  domain!: string;

  @IsInt()
  @Min(1)
  productId!: number;

  @IsIn(['DNS', 'EMAIL'])
  validation!: 'DNS' | 'EMAIL';

  @IsOptional()
  @IsEmail()
  approverEmail?: string;
}

/** G-08 — płatne certyfikaty SSL w zakładce SSL usługi. */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class SslController {
  constructor(private readonly ssl: SslService) {}

  @Get(':id/ssl-orders')
  panel(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.ssl.panel(user.userId, id);
  }

  @Post(':id/ssl-orders')
  zamow(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: ZamowSslDto) {
    return this.ssl.zamow(user.userId, user.userId, id, body);
  }

  @Post(':id/ssl-orders/:orderId/check')
  @HttpCode(200)
  sprawdz(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Param('orderId') orderId: string) {
    return this.ssl.sprawdzTeraz(user.userId, id, orderId);
  }
}

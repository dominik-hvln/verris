import { Controller, Get, Header, Query } from '@nestjs/common';
import { ControlPlaneMailService } from './control-plane-mail.service';

@Controller('public/mail')
export class ControlPlaneMailPublicController {
  constructor(private readonly mail: ControlPlaneMailService) {}

  /** Link z maila potwierdzającego — bez JWT. */
  @Get('forward-confirm')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async confirmForward(@Query('token') token?: string): Promise<string> {
    const result = await this.mail.confirmMailForward(token ?? '');
    return result.html;
  }
}

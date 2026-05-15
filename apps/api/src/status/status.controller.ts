import { Controller, Get, Header, HttpCode } from '@nestjs/common';
import { StatusService } from './status.service';

/**
 * Publicly accessible status endpoint. NO authentication — designed for the
 * `status.verris.pl` Next.js app and any third-party uptime aggregators.
 *
 * Cache-Control is set to 30 s, matching the in-memory cache TTL inside
 * `StatusService`. CDN/edge layers can safely fan out from this.
 */
@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  @HttpCode(200)
  @Header('Cache-Control', 'public, max-age=30')
  getPublic() {
    return this.status.getPublicStatus();
  }
}

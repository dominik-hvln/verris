import { Module } from '@nestjs/common';
import { FontsProxyService } from './fonts-proxy.service.js';
import { FontsProxyController } from './fonts-proxy.controller.js';

/**
 * FONT-1 — proxy/CDN fontów (RODO). Config globalny; brak innych zależności.
 */
@Module({
  controllers: [FontsProxyController],
  providers: [FontsProxyService],
  exports: [FontsProxyService],
})
export class FontsProxyModule {}

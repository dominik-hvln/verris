import { Global, Module } from '@nestjs/common';
import { AlarmyService } from './alarmy.service.js';

/** Alarmy operacyjne dla administratorów (panel + e-mail + push) — dostępne w całej aplikacji. */
@Global()
@Module({
  providers: [AlarmyService],
  exports: [AlarmyService],
})
export class AlarmyModule {}

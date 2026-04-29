import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Eksportujemy, by w innych modułach nie powtarzać wstrzyknięcia
})
export class PrismaModule {}

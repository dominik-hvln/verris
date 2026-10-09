import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ustawZrodloAdresowWezlow } from './migration-net.util.js';

/**
 * 09.10 — podaje strażnikowi SSRF migratora (migration-net.util) adresy węzłów z bazy.
 * Wszystkie wiersze Server, także wycofane: adres po węźle nadal może należeć do nas,
 * a odmowa jest stroną bezpieczną. Zapytanie przy każdym sprawdzeniu hosta (tabela ma kilka wierszy),
 * więc nowy węzeł jest chroniony od chwili dodania, bez restartu API.
 */
@Injectable()
export class AdresyWezlowRejestr implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    ustawZrodloAdresowWezlow(async () => {
      const wezly = await this.prisma.server.findMany({ select: { ipAddress: true, ipv6Address: true } });
      return wezly.flatMap((w) => [w.ipAddress, w.ipv6Address]);
    });
  }

  onModuleDestroy(): void {
    ustawZrodloAdresowWezlow(null);
  }
}

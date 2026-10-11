import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@verris/database';

/**
 * Pola BigInt pomijane we wszystkich odczytach modelu, chyba że zapytanie wybierze je jawnie (`select`).
 *
 * Account.offsiteBackupBytes (F3.3) to BigInt, a konto trafia w całości do wielu odpowiedzi API
 * (`include: { account: true }` na karcie usługi, w liście usług, w panelu obsługi…). JSON.stringify nie umie
 * BigInt — po pierwszym raporcie kopii per konto każda taka odpowiedź kończyła się 500 („Nie udało się wczytać
 * usługi” w adminie, weryfikacja 11.10). Rozmiar kopii czyta wyłącznie widok „Kopie floty” (kopie-floty.ts,
 * jawny `select`) i zamienia go na Number.
 * https://www.prisma.io/docs/orm/prisma-client/queries/excluding-fields#excluding-a-field-globally-using-omit
 */
export const POMIJANE_POLA_BIGINT = { account: { offsiteBackupBytes: true } } as const;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      omit: POMIJANE_POLA_BIGINT,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

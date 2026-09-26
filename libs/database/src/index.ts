import { PrismaClient as PrismaClientBazowy } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * X-20 — Prisma 7 łączy się z bazą przez driver adapter (dokumentacja „Upgrade to Prisma ORM 7”:
 * `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`; bez adaptera konstruktor rzuca błąd).
 * Ta klasa dokłada adapter sama, więc każde `new PrismaClient()` w repozytorium (API, CLI, seed, skrypty ops)
 * działa jak dotąd — adres z DATABASE_URL, tak jak w Prismie 6.
 */
type OpcjeKlienta = NonNullable<ConstructorParameters<typeof PrismaClientBazowy>[0]>;

/** Adapter jest leniwy: połączenie (pula pg) powstaje przy pierwszym zapytaniu, nie przy imporcie. */
export function adapterBazy(connectionString = process.env.DATABASE_URL) {
  return new PrismaPg({ connectionString });
}

export class PrismaClient extends PrismaClientBazowy {
  constructor(opcje: Omit<OpcjeKlienta, 'adapter'> & { adapter?: OpcjeKlienta['adapter'] } = {}) {
    super({ ...opcje, adapter: opcje.adapter ?? adapterBazy() } as OpcjeKlienta);
  }
}

// PB-39: klient z generatora `prisma-client` (ESM, src/generated/prisma) zamiast `@prisma/client`.
export * from './generated/prisma/client.js';

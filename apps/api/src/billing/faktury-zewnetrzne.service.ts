import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { RODZAJ_DOKUMENT_ROZLICZENIOWY } from './tryb-fakturowania.js';

/**
 * FAK-01 — kolejka dokumentów rozliczeniowych czekających na fakturę z
 * programu księgowego i dopisywanie jej numeru.
 *
 * „Czeka na fakturę" nie jest osobnym statusem w `InvoiceStatus` celowo:
 * status mówi o PIENIĄDZACH (PAID, VOID…), a brak faktury zewnętrznej jest
 * stanem dokumentu. Wynika wprost z danych — rozliczeniowy i bez numeru
 * zewnętrznego — więc nie da się go zapomnieć ustawić ani ustawić źle.
 */
@Injectable()
export class FakturyZewnetrzneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Najstarsze pierwsze — termin na fakturę biegnie od sprzedaży. */
  async czekajaceNaFakture(limit = 200) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        rodzajPrawny: RODZAJ_DOKUMENT_ROZLICZENIOWY,
        externalInvoiceNumber: null,
        status: 'PAID',
      },
      orderBy: { issuedAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        number: true,
        kind: true,
        userId: true,
        amount: true,
        netAmount: true,
        vatAmount: true,
        currency: true,
        issuedAt: true,
        paidAt: true,
        // PROD-03 — konto wewnętrzne (testowe) oznaczone w kolejce. Nie ukrywamy: prawdziwa wpłata to
        // sprzedaż i faktura VAT należy się także wtedy — decyduje operator/księgowa.
        user: { select: { isInternal: true } },
      },
    });
    return rows.map(({ user, ...r }) => ({
      ...r,
      kontoWewnetrzne: user?.isInternal ?? false,
      amount: r.amount.toFixed(2),
      netAmount: r.netAmount?.toFixed(2) ?? null,
      vatAmount: r.vatAmount?.toFixed(2) ?? null,
    }));
  }

  /**
   * Dopisuje numer faktury zewnętrznej. Raz — zmiana numeru już dopisanego
   * to korekta w programie księgowym, a nie edycja w panelu; nadpisanie
   * zatarłoby ślad, do którego dokumentu która faktura należała.
   */
  async dopiszNumer(input: { invoiceId: string; numer: string; aktorUserId: string }) {
    const numer = input.numer.trim();
    if (!numer) throw new BadRequestException('Numer faktury jest pusty.');

    const dok = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        userId: true,
        number: true,
        rodzajPrawny: true,
        externalInvoiceNumber: true,
      },
    });
    if (!dok) throw new NotFoundException(`Nie ma dokumentu ${input.invoiceId}`);
    if (dok.rodzajPrawny !== RODZAJ_DOKUMENT_ROZLICZENIOWY) {
      throw new BadRequestException(
        `${dok.number} jest fakturą VAT wystawioną przez panel — nie dopisuje się do niej faktury zewnętrznej.`,
      );
    }
    if (dok.externalInvoiceNumber) {
      throw new ConflictException(
        `${dok.number} ma już fakturę ${dok.externalInvoiceNumber}. Zmiana to korekta w programie księgowym.`,
      );
    }

    const teraz = new Date();
    try {
      // Warunek w WHERE, nie tylko w odczycie wyżej: dwóch operatorów
      // dopisujących naraz nie nadpisze się nawzajem.
      const wynik = await this.prisma.invoice.updateMany({
        where: { id: dok.id, externalInvoiceNumber: null },
        data: {
          externalInvoiceNumber: numer,
          externalInvoiceAt: teraz,
          externalInvoiceById: input.aktorUserId,
        },
      });
      if (wynik.count !== 1) {
        throw new ConflictException(`${dok.number} dostał fakturę w międzyczasie.`);
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `Faktura ${numer} jest już przypisana do innego dokumentu.`,
        );
      }
      throw err;
    }

    await this.audit.record({
      action: 'FAKTURA_ZEWNETRZNA_DOPISANA',
      userId: dok.userId,
      actorUserId: input.aktorUserId,
      details: { invoiceId: dok.id, dokument: dok.number, fakturaZewnetrzna: numer },
    });

    return { id: dok.id, number: dok.number, externalInvoiceNumber: numer, externalInvoiceAt: teraz };
  }
}

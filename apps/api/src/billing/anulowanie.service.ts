import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { StripeService } from './stripe/stripe.service.js';

const DO_ANULOWANIA: InvoiceStatus[] = [InvoiceStatus.DRAFT, InvoiceStatus.OPEN];

/**
 * M-08 — anulowanie dokumentu (decyzja właściciela 2026-09-23): wolno tylko
 * nieopłacony (DRAFT/OPEN). Opłacony — także z portfela — zmienia się korektą,
 * bo za nim poszły pieniądze i numer w obrocie. Numer anulowanego zostaje
 * (ciągłość numeracji), zmienia się tylko status.
 */
@Injectable()
export class AnulowanieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stripe: StripeService,
  ) {}

  async anuluj(input: { invoiceId: string; powod: string; aktorUserId: string }) {
    const f = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, number: true, status: true, userId: true, provider: true, providerRef: true },
    });
    if (!f) throw new NotFoundException('Dokument nie istnieje.');
    if (!DO_ANULOWANIA.includes(f.status)) {
      throw new BadRequestException(
        f.status === InvoiceStatus.VOID
          ? 'Dokument jest już anulowany.'
          : 'Anulować można tylko dokument nieopłacony. Opłacony zmienisz korektą.',
      );
    }
    // Faktura Stripe musi zostać unieważniona u źródła, inaczej Stripe dalej
    // może ją pobrać, a webhook przywróci jej status. Błąd Stripe = nic nie
    // zmieniamy lokalnie.
    if (f.provider === 'STRIPE' && f.providerRef) {
      await this.stripe.voidInvoice(f.providerRef);
    }
    const { count } = await this.prisma.invoice.updateMany({
      where: { id: f.id, status: { in: DO_ANULOWANIA } },
      data: { status: InvoiceStatus.VOID },
    });
    if (count === 0) throw new BadRequestException('Status dokumentu zmienił się w międzyczasie — odśwież i spróbuj ponownie.');
    await this.audit.record({
      action: 'INVOICE_VOIDED',
      userId: f.userId,
      actorUserId: input.aktorUserId,
      details: { invoiceId: f.id, number: f.number, fromStatus: f.status, powod: input.powod },
    });
    return { id: f.id, number: f.number, status: InvoiceStatus.VOID };
  }
}

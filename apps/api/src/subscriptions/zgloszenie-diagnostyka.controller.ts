import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditService } from '../common/audit/audit.service.js';
import { TicketOpsActions } from '../common/audit/audit.actions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiagnosticsService } from './diagnostics.service.js';

/**
 * PB-43 — diagnostyka usługi uruchamiana z rozmowy w obsłudze. Ta sama diagnostyka co na karcie usługi
 * (ADM-2, `GET admin/subscriptions/:id/diagnostics`), ale wyłącznie dla usługi powiązanej ze zgłoszeniem
 * i za uprawnieniem do prowadzenia zgłoszeń (TICKETS_MANAGE) — konsultant nie potrzebuje do tego zarządzania
 * subskrypcjami. Nie za samym podglądem (TICKETS_VIEW): diagnostyka odpytuje węzeł i zapisuje stan zdrowia usługi
 * (forSubscription → computeAndPersist), więc to operacja, a nie odczyt.
 * L1-KARTA (decyzja właściciela 08.10): ograniczenie TICKETS_MANAGE do usługi ze zgłoszenia obowiązuje już tylko
 * tutaj — z karty usługi (`GET admin/subscriptions/:id/diagnostics`) TICKETS_MANAGE uruchamia diagnostykę dowolnej
 * usługi. Ten sam zabieg ma w dzienniku dwie akcje: stąd TICKET_DIAGNOSTICS_RUN (z wynikiem), z karty
 * OPERATOR_ACCOUNT_VIEWED, sekcja 'diagnostyka' (wpis przed odpytaniem węzła, bez wyniku) — filtruj po obu.
 * Mieszka w module subskrypcji, bo DiagnosticsService jest tutaj (moduł zgłoszeń jest importowany przez ten).
 */
@Controller('tickets/admin')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles('STAFF', 'ADMIN')
@StaffPerm('TICKETS_MANAGE')
export class ZgloszenieDiagnostykaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diagnostics: DiagnosticsService,
    private readonly audit: AuditService,
  ) {}

  @Get(':id/diagnostyka')
  async diagnostyka(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: { userId: string }) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, select: { userId: true, subscriptionId: true } });
    if (!ticket) throw new NotFoundException('Nie znaleziono zgłoszenia.');
    if (!ticket.subscriptionId) throw new BadRequestException('Zgłoszenie nie jest powiązane z usługą — najpierw wskaż usługę.');
    const wynik = await this.diagnostics.forSubscription(ticket.subscriptionId);
    await this.audit.record({
      action: TicketOpsActions.TICKET_DIAGNOSTICS_RUN,
      userId: ticket.userId,
      actorUserId: actor.userId,
      details: { ticketId: id, subscriptionId: ticket.subscriptionId, overall: wynik.overall },
    });
    return wynik;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService, normalizujTagi, odmowaScalonego } from './tickets.service.js';
import { TicketContextService } from './ticket-context.service.js';
import { renderTemplate } from './ticket-context.js';
import type { AdminUpdateTicketDto } from './tickets.dto.js';

/**
 * F3.7 (OE-07) — makra zgłoszeń: szablon odpowiedzi z akcjami (stan, tagi, przypisanie), zastosowany jednym
 * kliknięciem — jak makra Zendeska (https://support.zendesk.com/hc/en-us/articles/4408887656602-Using-macros-to-update-tickets).
 * Makro to istniejący szablon odpowiedzi (CannedResponse) z co najmniej jedną akcją; treść idzie do klienta z
 * podstawionymi zmiennymi zgłoszenia (te same co w podpowiedziach), a akcje przez tę samą logikę co ręczna zmiana
 * (oś zgłoszenia, powiadomienia, przeliczenie, walidacja opiekuna).
 */
export interface AkcjeMakra {
  makroStan: string | null;
  makroTagi: string[];
  makroPrzypisz: string | null;
}

export const STANY_MAKRA = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'] as const;

export function czyMakro(m: AkcjeMakra): boolean {
  return !!m.makroStan || m.makroTagi.length > 0 || !!m.makroPrzypisz;
}

export interface PlanMakra {
  /** Odpowiedź: „czekaj na klienta” (WAITING_CUSTOMER) albo „sprawa u nas” (IN_PROGRESS). */
  czekaj: 'tak' | 'nie';
  /** Zmiana po odpowiedzi — tylko gdy stan makra różni się od stanu, który ustawia sama odpowiedź, i/lub przypisanie. */
  zmiana: AdminUpdateTicketDto | null;
  tagi: string[];
}

/**
 * Co zrobi makro. Odpowiedź sama ustawia WAITING_CUSTOMER albo IN_PROGRESS, więc dla tych stanów wystarcza właściwe
 * „czekaj”; OPEN i CLOSED to zmiana po odpowiedzi (zamknięcie wysyła podziękowanie z prośbą o ocenę, jak ręcznie).
 * Przypisanie: JA — stosujący, NIKT — bez opiekuna (pole `null`), brak — bez zmiany.
 */
export function planMakra(m: AkcjeMakra, stosujacyId: string): PlanMakra {
  if (m.makroStan && !(STANY_MAKRA as readonly string[]).includes(m.makroStan)) {
    throw new BadRequestException('Makro ma nieznany stan — popraw je w ustawieniach szablonów.');
  }
  const czekaj = !m.makroStan || m.makroStan === 'WAITING_CUSTOMER' ? 'tak' : 'nie';
  const zmiana: AdminUpdateTicketDto = {};
  if (m.makroStan === 'OPEN' || m.makroStan === 'CLOSED') zmiana.status = m.makroStan;
  if (m.makroPrzypisz === 'JA') zmiana.assignedToId = stosujacyId;
  else if (m.makroPrzypisz === 'NIKT') (zmiana as { assignedToId: string | null }).assignedToId = null;
  else if (m.makroPrzypisz) throw new BadRequestException('Makro ma nieznane przypisanie — popraw je w ustawieniach szablonów.');
  return { czekaj, zmiana: Object.keys(zmiana).length ? zmiana : null, tagi: normalizujTagi(m.makroTagi) };
}

@Injectable()
export class MakraZgloszenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly context: TicketContextService,
  ) {}

  async zastosuj(ticketId: string, makroId: string, aktorId: string) {
    const m = await this.prisma.cannedResponse.findUnique({ where: { id: makroId } });
    if (!m || !m.isActive) throw new NotFoundException('Makro nie istnieje albo jest wyłączone.');
    if (!czyMakro(m)) throw new BadRequestException('Ten szablon nie ma akcji — wstaw go jako zwykłą odpowiedź.');
    const t = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, tags: true, scalonoDoId: true } });
    if (!t) throw new NotFoundException('Nie znaleziono zgłoszenia.');
    odmowaScalonego(t);
    const plan = planMakra(m, aktorId);
    // Plan (stan, tagi, przypisanie) sprawdzony przed odpowiedzią — zły szablon nie wyśle klientowi połowy makra.
    const tresc = renderTemplate(m.content, await this.context.varsFor(ticketId)).trim();
    if (tresc.length < 2) throw new BadRequestException('Makro ma pustą treść.');
    await this.tickets.adminAddReply(ticketId, aktorId, { message: tresc, czekaj: plan.czekaj });
    if (plan.zmiana) await this.tickets.adminUpdateTicket(ticketId, plan.zmiana, aktorId);
    const tagi = [...new Set([...t.tags, ...plan.tagi])];
    if (tagi.length !== t.tags.length) await this.tickets.adminSetTags(ticketId, aktorId, tagi);
    await this.prisma.ticketEvent.create({ data: { ticketId, type: 'MACRO_APPLIED', actorId: aktorId, meta: { makro: m.title } } });
    return { ok: true as const };
  }

  /** Makra do wyboru w zgłoszeniu (aktywne szablony z akcjami), z podglądem treści dla tego zgłoszenia. */
  async lista(ticketId?: string) {
    const rows = await this.prisma.cannedResponse.findMany({ where: { isActive: true }, orderBy: { title: 'asc' } });
    const makra = rows.filter(czyMakro);
    const vars = ticketId ? await this.context.varsFor(ticketId) : null;
    return makra.map((m) => ({
      id: m.id,
      title: m.title,
      content: vars ? renderTemplate(m.content, vars) : m.content,
      makroStan: m.makroStan,
      makroTagi: m.makroTagi,
      makroPrzypisz: m.makroPrzypisz,
    }));
  }
}

import type { MailMessage } from '../mailer.interface';

export interface TicketContext {
  ticketId: string;
  subject: string;
  customerEmail: string;
  panelUrl: string;
}

export function newTicketCreatedTemplate(ctx: TicketContext): MailMessage {
  return {
    to: ctx.customerEmail,
    tag: 'ticket.created',
    subject: `[#${ctx.ticketId.slice(0, 8)}] Otrzymaliśmy Twoje zgłoszenie`,
    text: `Cześć!

Otrzymaliśmy Twoje zgłoszenie i właśnie trafiło do naszego zespołu wsparcia.

Tytuł: ${ctx.subject}
Status zgłoszenia możesz śledzić w panelu: ${ctx.panelUrl}/dashboard/support/${ctx.ticketId}

Standardowy czas pierwszej odpowiedzi to 1 godzina robocza. Jeśli sprawa jest pilna, zaznacz to w opisie — przyspieszymy.

— Zespół EkoHost
`,
  };
}

export function ticketStatusChangedTemplate(
  ctx: TicketContext & { newStatus: string },
): MailMessage {
  return {
    to: ctx.customerEmail,
    tag: 'ticket.status-changed',
    subject: `[#${ctx.ticketId.slice(0, 8)}] Status zgłoszenia: ${ctx.newStatus}`,
    text: `Cześć!

Status Twojego zgłoszenia "${ctx.subject}" zmienił się na: ${ctx.newStatus}

Pełen przebieg konwersacji jest dostępny w panelu: ${ctx.panelUrl}/dashboard/support/${ctx.ticketId}

— Zespół EkoHost
`,
  };
}

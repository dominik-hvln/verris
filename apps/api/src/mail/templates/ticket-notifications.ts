import type { MailMessage } from '../mailer.interface';
import { escapeHtml, renderEmailShell } from './_layouts/email-shell';

export interface TicketContext {
  ticketId: string;
  subject: string;
  customerEmail: string;
  panelUrl: string;
}

export function newTicketCreatedTemplate(ctx: TicketContext): MailMessage {
  const shortId = ctx.ticketId.slice(0, 8);
  const ticketUrl = `${ctx.panelUrl}/dashboard/support/${ctx.ticketId}`;
  const safeSubject = escapeHtml(ctx.subject);

  const { html, text } = renderEmailShell({
    title: 'Otrzymaliśmy Twoje zgłoszenie',
    preheader: `Sprawa #${shortId} jest już w obsłudze — odpowiedź w ciągu 1h roboczej.`,
    bodyMarkdown: [
      `Cześć!`,
      ``,
      `Twoje zgłoszenie **#${shortId}** trafiło do naszego zespołu wsparcia i zaczynamy nad nim pracować.`,
      ``,
      `## Tytuł zgłoszenia`,
      ``,
      safeSubject,
      ``,
      `Standardowy czas pierwszej odpowiedzi to **1 godzina robocza**. Jeśli sprawa jest pilna, zaznacz to w wątku — przyspieszymy.`,
    ].join('\n'),
    cta: {
      label: 'Zobacz status zgłoszenia',
      url: ticketUrl,
    },
    footnote: 'Cała korespondencja zapisuje się w panelu — możesz odpowiadać bezpośrednio z poziomu zgłoszenia.',
    recipientEmail: ctx.customerEmail,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.customerEmail,
    tag: 'ticket.created',
    subject: `[#${shortId}] Otrzymaliśmy Twoje zgłoszenie`,
    text,
    html,
  };
}

export interface TicketReplyContext {
  to: string;
  ticketId: string;
  subject: string;
  excerpt: string;
  panelUrl: string;
  /** Staff panel URL for internal notifications. */
  staffPanelUrl?: string;
  isFromStaff: boolean;
}

export function ticketReplyNotificationTemplate(ctx: TicketReplyContext): MailMessage {
  const shortId = ctx.ticketId.slice(0, 8);
  const ticketUrl = ctx.isFromStaff
    ? `${ctx.panelUrl}/dashboard/support/${ctx.ticketId}`
    : `${ctx.staffPanelUrl ?? ctx.panelUrl}/dashboard/tickets/${ctx.ticketId}`;
  const safeSubject = escapeHtml(ctx.subject);
  const excerpt = escapeHtml(ctx.excerpt.slice(0, 500));
  const title = ctx.isFromStaff ? 'Nowa odpowiedź od supportu' : 'Nowa wiadomość od klienta';
  const preheader = ctx.isFromStaff
    ? `Support odpowiedział w sprawie #${shortId}.`
    : `Klient dopisał w sprawie #${shortId}.`;

  const { html, text } = renderEmailShell({
    title,
    preheader,
    bodyMarkdown: [
      `Cześć!`,
      ``,
      ctx.isFromStaff
        ? `Nasz zespół odpowiedział w zgłoszeniu **"${safeSubject}"** (#${shortId}).`
        : `Klient dopisał w zgłoszeniu **"${safeSubject}"** (#${shortId}).`,
      ``,
      `> ${excerpt}${ctx.excerpt.length > 500 ? '…' : ''}`,
    ].join('\n'),
    cta: { label: 'Otwórz zgłoszenie', url: ticketUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: ctx.isFromStaff ? 'ticket.reply.staff' : 'ticket.reply.client',
    subject: `[#${shortId}] ${ctx.isFromStaff ? 'Odpowiedź supportu' : 'Nowa wiadomość'}: ${ctx.subject}`,
    text,
    html,
  };
}

export function ticketStatusChangedTemplate(
  ctx: TicketContext & { newStatus: string },
): MailMessage {
  const shortId = ctx.ticketId.slice(0, 8);
  const ticketUrl = `${ctx.panelUrl}/dashboard/support/${ctx.ticketId}`;
  const safeStatus = escapeHtml(ctx.newStatus);
  const safeSubject = escapeHtml(ctx.subject);

  const { html, text } = renderEmailShell({
    title: 'Status Twojego zgłoszenia się zmienił',
    preheader: `Sprawa #${shortId} została zaktualizowana — sprawdź szczegóły.`,
    bodyMarkdown: [
      `Cześć!`,
      ``,
      `Status zgłoszenia "${safeSubject}" (#${shortId}) zmienił się na: **${safeStatus}**.`,
      ``,
      `Pełny przebieg konwersacji oraz ewentualne pliki dołączone przez nasz zespół znajdziesz w panelu.`,
    ].join('\n'),
    cta: {
      label: 'Otwórz zgłoszenie',
      url: ticketUrl,
    },
    recipientEmail: ctx.customerEmail,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.customerEmail,
    tag: 'ticket.status-changed',
    subject: `[#${shortId}] Status zgłoszenia: ${ctx.newStatus}`,
    text,
    html,
  };
}

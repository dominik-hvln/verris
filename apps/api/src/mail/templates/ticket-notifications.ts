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

// -----------------------------------------------------------------------------
// SUP-V2 — powiadomienia operacyjne (staff) i cykl braku odpowiedzi (klient).
// -----------------------------------------------------------------------------

export interface TicketStaffContext {
  to: string;
  ticketId: string;
  subject: string;
  /** Bazowy URL panelu staff (bez końcowego slasha). */
  staffPanelUrl: string;
}

/** Staff: przypisano Ci zgłoszenie. */
export function ticketStaffAssignedTemplate(ctx: TicketStaffContext): MailMessage {
  const shortId = ctx.ticketId.slice(0, 8);
  const ticketUrl = `${ctx.staffPanelUrl}/tickets/${ctx.ticketId}`;
  const safeSubject = escapeHtml(ctx.subject);

  const { html, text } = renderEmailShell({
    title: 'Przypisano Ci zgłoszenie',
    preheader: `Sprawa #${shortId} czeka na Twoją reakcję.`,
    bodyMarkdown: [
      `Cześć!`,
      ``,
      `Do obsługi trafiło zgłoszenie **"${safeSubject}"** (#${shortId}).`,
      ``,
      `Otwórz je w panelu staff, żeby odpowiedzieć klientowi lub zmienić przypisanie.`,
    ].join('\n'),
    cta: { label: 'Otwórz w panelu staff', url: ticketUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.staffPanelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'ticket.assigned.staff',
    subject: `[#${shortId}] Przypisano Ci zgłoszenie: ${ctx.subject}`,
    text,
    html,
  };
}

/** Staff: minął czas SLA pierwszej odpowiedzi, a nikt jeszcze nie odpisał. */
export function ticketSlaBreachStaffTemplate(
  ctx: TicketStaffContext & { dueAt: Date },
): MailMessage {
  const shortId = ctx.ticketId.slice(0, 8);
  const ticketUrl = `${ctx.staffPanelUrl}/tickets/${ctx.ticketId}`;
  const safeSubject = escapeHtml(ctx.subject);
  const due = ctx.dueAt.toLocaleString('pl-PL');

  const { html, text } = renderEmailShell({
    title: 'SLA pierwszej odpowiedzi przekroczone',
    preheader: `Sprawa #${shortId} czeka na pierwszą odpowiedź po terminie SLA.`,
    bodyMarkdown: [
      `Uwaga!`,
      ``,
      `Zgłoszenie **"${safeSubject}"** (#${shortId}) nie otrzymało jeszcze pierwszej odpowiedzi, a termin SLA minął (**${due}**).`,
      ``,
      `Zajmij się nim priorytetowo albo przydziel innej osobie.`,
    ].join('\n'),
    cta: { label: 'Otwórz zgłoszenie', url: ticketUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.staffPanelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'ticket.sla.breach.staff',
    subject: `[#${shortId}] ⚠ SLA przekroczone: ${ctx.subject}`,
    text,
    html,
  };
}

/** Klient: czekamy na Twoją odpowiedź — zgłoszenie zamknie się za N dni. */
export function ticketCustomerReminderTemplate(
  ctx: TicketContext & { closeInDays: number },
): MailMessage {
  const shortId = ctx.ticketId.slice(0, 8);
  const ticketUrl = `${ctx.panelUrl}/dashboard/support/${ctx.ticketId}`;
  const safeSubject = escapeHtml(ctx.subject);

  const { html, text } = renderEmailShell({
    title: 'Czekamy na Twoją odpowiedź',
    preheader: `Sprawa #${shortId} czeka na Twoją odpowiedź.`,
    bodyMarkdown: [
      `Cześć!`,
      ``,
      `W zgłoszeniu **"${safeSubject}"** (#${shortId}) czekamy na Twoją odpowiedź, żeby móc kontynuować.`,
      ``,
      `Jeśli sprawa jest już nieaktualna, nic nie musisz robić — zgłoszenie zamknie się automatycznie za **${ctx.closeInDays} dni**. Aby kontynuować, wystarczy odpowiedzieć w panelu.`,
    ].join('\n'),
    cta: { label: 'Odpowiedz w panelu', url: ticketUrl },
    recipientEmail: ctx.customerEmail,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.customerEmail,
    tag: 'ticket.reminder.client',
    subject: `[#${shortId}] Czekamy na Twoją odpowiedź: ${ctx.subject}`,
    text,
    html,
  };
}

/** Klient: zgłoszenie zostało zamknięte automatycznie po braku odpowiedzi. */
export function ticketAutoClosedTemplate(ctx: TicketContext): MailMessage {
  const shortId = ctx.ticketId.slice(0, 8);
  const ticketUrl = `${ctx.panelUrl}/dashboard/support/${ctx.ticketId}`;
  const safeSubject = escapeHtml(ctx.subject);

  const { html, text } = renderEmailShell({
    title: 'Zgłoszenie zamknięte',
    preheader: `Sprawa #${shortId} została zamknięta po braku odpowiedzi.`,
    bodyMarkdown: [
      `Cześć!`,
      ``,
      `Zgłoszenie **"${safeSubject}"** (#${shortId}) zostało zamknięte automatycznie, ponieważ nie otrzymaliśmy odpowiedzi.`,
      ``,
      `To nie problem — jeśli sprawa jest nadal aktualna, po prostu odpowiedz w panelu, a zgłoszenie zostanie ponownie otwarte.`,
    ].join('\n'),
    cta: { label: 'Otwórz zgłoszenie', url: ticketUrl },
    recipientEmail: ctx.customerEmail,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.customerEmail,
    tag: 'ticket.autoclosed.client',
    subject: `[#${shortId}] Zgłoszenie zamknięte: ${ctx.subject}`,
    text,
    html,
  };
}

/** Pobranie przez Route Handler proxy (Bearer z httpOnly cookie). */
export function clientTicketAttachmentDownloadHref(ticketId: string, attachmentId: string): string {
  return `/api/tickets/${ticketId}/attachments/${attachmentId}/file`;
}

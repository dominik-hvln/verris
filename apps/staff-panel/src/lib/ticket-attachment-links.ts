/** Pobranie przez Route Handler proxy (staff cookie → Bearer upstream). */
export function staffTicketAttachmentDownloadHref(ticketId: string, attachmentId: string): string {
  return `/api/tickets/${ticketId}/attachments/${attachmentId}/file`;
}

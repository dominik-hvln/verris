/**
 * E-20 — dobowy limit wiadomości wysyłanych z jednego konta hostingowego (exim na węźle,
 * /etc/virtual/limit ustawiany przez ops/scripts/node-hosting-profile.sh). Pokazywany
 * klientowi w zakładce Poczta. Zmiana tu bez zmiany w skrypcie wywraca test zgodności.
 */
export const HOSTING_MAIL_DAILY_SEND_LIMIT = 1000;

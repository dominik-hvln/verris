/**
 * D1 (10.10) — jeden panel operatora: karty klienta i usługi rozwija panel admina, a panel obsługi zostaje skrzynką
 * helpdesku. Adres panelu operatora z ADMIN_PANEL_URL (ta sama zmienna co w API i w build args paneli w
 * docker-compose.prod.yml); bez niej — produkcyjny adres. Tylko po stronie serwera.
 */
export const DOMYSLNY_ADRES_PANELU_OPERATORA = "https://admin.verris.pl";

export function adresPaneluOperatora(env: Record<string, string | undefined> = process.env): string {
  const adres = env.ADMIN_PANEL_URL?.trim() || DOMYSLNY_ADRES_PANELU_OPERATORA;
  return adres.replace(/\/+$/, "");
}

export const kartaKlientaOperatora = (userId: string, env?: Record<string, string | undefined>) =>
  `${adresPaneluOperatora(env)}/customers/${encodeURIComponent(userId)}`;

export const kartaUslugiOperatora = (subscriptionId: string, env?: Record<string, string | undefined>) =>
  `${adresPaneluOperatora(env)}/subscriptions/${encodeURIComponent(subscriptionId)}`;

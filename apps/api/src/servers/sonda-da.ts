/**
 * Sonda API DirectAdmina (po teście D3 na t1, 28.09): dwa parsery panelu były pisane pod format, którego
 * DA 1.710 nie zwraca (lista DNS, Custom HTTPD). Sonda robi te same odczyty co panel — z control-plane,
 * kluczami, które API już ma — i zwraca tylko kształt odpowiedzi: kod HTTP, format i NAZWY pól, bez wartości.
 */
export type WynikSondy = { poziom: 'konto' | 'admin'; sciezka: string; json: boolean; kod: number; format: string; ksztalt: string };

/** Odczyty panelu (tylko GET, nic nie zmieniają). `{D}` = domena konta. */
export const ODCZYTY_DA: Array<{ poziom: 'konto' | 'admin'; sciezka: string }> = [
  { poziom: 'konto', sciezka: '/CMD_API_SHOW_DOMAINS' },
  { poziom: 'konto', sciezka: '/CMD_API_SHOW_USER_CONFIG' },
  { poziom: 'konto', sciezka: '/CMD_API_SHOW_USER_USAGE' },
  { poziom: 'konto', sciezka: '/CMD_API_DNS_CONTROL?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_ADDITIONAL_DOMAINS?action=view&domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_SUBDOMAINS?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_DOMAIN_POINTER?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_POP?action=list&domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_EMAIL_FORWARDERS?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_EMAIL_AUTORESPONDER?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_EMAIL_CATCH_ALL?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_SPAMASSASSIN?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_FTP?action=list&domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_DATABASES' },
  { poziom: 'konto', sciezka: '/CMD_API_SSL?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_CRON' },
  { poziom: 'konto', sciezka: '/CMD_API_SITE_BACKUP?domain={D}' },
  { poziom: 'konto', sciezka: '/CMD_API_FILE_MANAGER?path=/domains/{D}' },
  { poziom: 'admin', sciezka: '/CMD_API_CUSTOM_HTTPD?domain={D}' },
  { poziom: 'admin', sciezka: '/CMD_API_DNS_ADMIN?domain={D}&action=dnssec&value=get_keys' },
  { poziom: 'admin', sciezka: '/CMD_API_SHOW_USERS' },
  { poziom: 'admin', sciezka: '/CMD_API_IP_CONFIG' },
];

function ksztalt(v: unknown, g = 0): string {
  if (Array.isArray(v)) return `[${v.length}× ${v.length ? ksztalt(v[0], g + 1) : ''}]`;
  if (v && typeof v === 'object') {
    const wpisy = Object.entries(v);
    if (g > 2) return `{…${wpisy.length}}`;
    const pola = wpisy.slice(0, 25).map(([k, x]) => `${k.length < 40 ? k : `${k.slice(0, 37)}…`}:${ksztalt(x, g + 1)}`);
    return `{${pola.join(', ')}${wpisy.length > 25 ? ', …' : ''}}`;
  }
  return v === null ? 'null' : typeof v;
}

/** Format i kształt surowej odpowiedzi — same nazwy pól, żadnych wartości. */
export function opiszOdpowiedz(body: string): { format: string; ksztalt: string } {
  const t = body.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return { format: 'json', ksztalt: ksztalt(JSON.parse(t)) };
    } catch {
      /* nie JSON — dalej */
    }
  }
  if (/^<(!doctype|html)/i.test(t)) return { format: 'html', ksztalt: `${t.length} B` };
  const pierwsza = t.split('\n', 1)[0] ?? '';
  if (pierwsza.includes('=') && !(t.split('&', 1)[0] ?? '').includes(' ')) {
    const klucze = t.split('&').filter(Boolean).map((x) => x.split('=', 1)[0]);
    return { format: 'urlencoded', ksztalt: `${klucze.length} pól: ${klucze.slice(0, 30).join(', ')}${klucze.length > 30 ? ' …' : ''}` };
  }
  return { format: 'tekst', ksztalt: `${t.length} B, ${t ? t.split('\n').length : 0} linii` };
}

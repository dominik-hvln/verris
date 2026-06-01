import type { ServiceHealthCheckDetailDto, ServiceHealthCheckKey } from '@verris/contracts';

export interface HealthProbeMeta {
  domain: string;
  serverIp: string;
  dnsResolved: string[];
  siteTls: { ok: boolean; authorized?: boolean; error?: string };
  panelHost: string;
  panelTls: { ok: boolean; authorized?: boolean; error?: string };
  mailHost: string;
  mailTls: { ok: boolean; authorized?: boolean; error?: string };
  cpuUsageAvg: number | null;
  cpuLimit: number | null;
  backupCounted: boolean;
}

type Checks = {
  dnsOk: boolean | null;
  tlsOk: boolean | null;
  backupFresh: boolean | null;
  lveOk: boolean | null;
  panelTlsOk: boolean | null;
  mailOk: boolean | null;
};

function okDetail(label: string, explanation: string): ServiceHealthCheckDetailDto {
  return { status: 'ok', label, explanation, whatToDo: 'Brak działań — parametr w normie.' };
}

function warnDetail(
  label: string,
  explanation: string,
  whatToDo: string,
): ServiceHealthCheckDetailDto {
  return { status: 'warn', label, explanation, whatToDo };
}

export function buildHealthCheckDetails(
  checks: Checks,
  meta: HealthProbeMeta,
): Partial<Record<ServiceHealthCheckKey, ServiceHealthCheckDetailDto>> {
  const out: Partial<Record<ServiceHealthCheckKey, ServiceHealthCheckDetailDto>> = {};

  if (checks.dnsOk === true) {
    out.dnsOk = okDetail(
      'DNS',
      `Domena ${meta.domain} wskazuje na serwer hostingu (${meta.serverIp}).`,
    );
  } else if (checks.dnsOk === false) {
    const seen = meta.dnsResolved.length ? meta.dnsResolved.join(', ') : 'brak rekordu A / błąd zapytania';
    out.dnsOk = warnDetail(
      'DNS',
      `Domena ${meta.domain} nie wskazuje na ${meta.serverIp}. Wykryte adresy A: ${seen}.`,
      'U rejestratora lub w zakładce „Domeny & DNS” ustaw rekord A (oraz www) na adres IP z panelu „Dane dostępowe”. Propagacja DNS może potrwać do 24 h.',
    );
  }

  if (checks.tlsOk === true) {
    out.tlsOk = okDetail('HTTPS', `Strona https://${meta.domain} ma działający certyfikat TLS.`);
  } else if (checks.tlsOk === false) {
    const extra = meta.siteTls.error ? ` (${meta.siteTls.error})` : meta.siteTls.authorized === false
      ? ' (połączenie działa, ale certyfikat nie jest w pełni zaufany)'
      : '';
    out.tlsOk = warnDetail(
      'HTTPS',
      `Brak poprawnego HTTPS na domenie ${meta.domain}${extra}.`,
      'W zakładce SSL włącz Let’s Encrypt lub wgraj własny certyfikat. Upewnij się, że domena wskazuje na ten serwer (DNS).',
    );
  }

  if (checks.panelTlsOk === true) {
    out.panelTlsOk = okDetail(
      'Panel hostingu',
      `Panel DirectAdmin (${meta.panelHost}:2222) odpowiada z poprawnym TLS.`,
    );
  } else if (checks.panelTlsOk === false) {
    out.panelTlsOk = warnDetail(
      'Panel hostingu',
      `Panel ${meta.panelHost}:2222 wymaga uwagi${meta.panelTls.error ? `: ${meta.panelTls.error}` : ''}.`,
      'Zwykle nie musisz nic robić — logowanie odbywa się przez nasz panel. Jeśli link „Panel hostingu” nie działa, napisz do supportu.',
    );
  }

  if (checks.mailOk === true) {
    out.mailOk = okDetail(
      'Poczta',
      `Serwer poczty ${meta.mailHost} (IMAPS :993) odpowiada.`,
    );
  } else if (checks.mailOk === false) {
    out.mailOk = warnDetail(
      'Poczta',
      `Serwer poczty ${meta.mailHost}:993 nie odpowiada lub TLS się nie powiódł${meta.mailTls.error ? ` (${meta.mailTls.error})` : ''}.`,
      'Sprawdź skrzynki w zakładce „Poczta” i ustawienia IMAP w kliencie pocztowym. Jeśli problem dotyczy całego węzła, zgłoś ticket do supportu.',
    );
  }

  if (checks.lveOk === true) {
    out.lveOk = okDetail(
      'Obciążenie CPU',
      meta.cpuUsageAvg != null && meta.cpuLimit != null
        ? `Średnie CPU ~${Math.round(meta.cpuUsageAvg)}% (limit planu ${meta.cpuLimit}%).`
        : 'Obciążenie CPU w normie.',
    );
  } else if (checks.lveOk === false) {
    out.lveOk = warnDetail(
      'Obciążenie CPU',
      meta.cpuUsageAvg != null && meta.cpuLimit != null
        ? `Wysokie obciążenie: ~${Math.round(meta.cpuUsageAvg)}% przy limicie ${meta.cpuLimit}% planu.`
        : 'Wykryto wysokie obciążenie CPU konta.',
      'Rozważ autoskalowanie lub wyższy plan, zoptymalizuj wtyczki/cache lub skontaktuj się ze wsparciem.',
    );
  }

  if (checks.backupFresh === true) {
    out.backupFresh = okDetail('Kopia zapasowa', 'Świeża kopia zapasowa jest dostępna (ostatnie 8 dni).');
  } else if (checks.backupFresh === false && meta.backupCounted) {
    out.backupFresh = warnDetail(
      'Kopia zapasowa',
      'Brak świeżej kopii zapasowej z ostatnich 8 dni.',
      'W zakładce Usage uruchom kopię zapasową lub skonfiguruj harmonogram w panelu hostingu.',
    );
  }

  return out;
}

/** Gdy snapshot nie ma zapisanych hintów (stare dane). */
export function fallbackHealthCheckDetails(checks: Checks): Partial<Record<ServiceHealthCheckKey, ServiceHealthCheckDetailDto>> {
  const generic = (label: string, ok: boolean) =>
    ok
      ? okDetail(label, 'Parametr w normie (szczegóły dostępne po odświeżeniu diagnostyki).')
      : warnDetail(label, 'Wykryto problem — odśwież diagnostykę lub skontaktuj się ze wsparciem.', 'Kliknij „Odśwież” w przeglądzie usługi, aby zobaczyć pełny opis. Jeśli problem się utrzymuje, utwórz zgłoszenie do supportu.');

  const out: Partial<Record<ServiceHealthCheckKey, ServiceHealthCheckDetailDto>> = {};
  if (checks.dnsOk != null) out.dnsOk = generic('DNS', checks.dnsOk);
  if (checks.tlsOk != null) out.tlsOk = generic('HTTPS', checks.tlsOk);
  if (checks.panelTlsOk != null) out.panelTlsOk = generic('Panel hostingu', checks.panelTlsOk);
  if (checks.mailOk != null) out.mailOk = generic('Poczta', checks.mailOk);
  if (checks.lveOk != null) out.lveOk = generic('Obciążenie CPU', checks.lveOk);
  if (checks.backupFresh != null) out.backupFresh = generic('Kopia zapasowa', checks.backupFresh);
  return out;
}

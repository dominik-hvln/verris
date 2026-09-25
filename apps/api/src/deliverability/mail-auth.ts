/**
 * E-15/E-16/E-17 — kreator SPF / DKIM / DMARC. Czysta logika (bez DNS i DA),
 * żeby dało się ją przetestować; zapytania robi DeliverabilityService.
 */

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface ZoneRecord {
  name: string;
  type: string;
  value: string;
}

export interface MailAuthSuggestion {
  host: string;
  type: string;
  value: string;
  /** Rekord w strefie Verris, który ta sugestia zastępuje (edycja zamiast dodania). */
  replaces?: ZoneRecord;
  /** Rekord już jest w strefie Verris — do skopiowania u zewnętrznego dostawcy DNS. */
  inZone?: boolean;
}

export interface MailAuthCheck {
  key: 'spf' | 'dmarc' | 'dkim';
  label: string;
  status: CheckStatus;
  detail: string;
  suggestion?: MailAuthSuggestion;
  /** E-16 — panel może to naprawić jednym kliknięciem (włączenie DKIM w DA). */
  action?: 'enable-dkim';
}

export interface MailAuthInput {
  domain: string;
  sendingIp: string | null;
  /** TXT na domenie głównej (publiczny DNS). */
  rootTxt: string[];
  /** TXT na _dmarc.<domena> (publiczny DNS). */
  dmarcTxt: string[];
  /** Selektor DKIM znaleziony w publicznym DNS. */
  dkimSelector: string | null;
  /** Strefa w DirectAdminie; null = nie udało się jej odczytać. */
  zone: ZoneRecord[] | null;
}

/** `"v=spf1 " "a ~all"` → `v=spf1 a ~all` (DA trzyma TXT w cudzysłowach, czasem dzielone). */
export function normTxt(v: string): string {
  return v.trim().replace(/"\s*"/g, '').replace(/^"|"$/g, '').trim();
}

/** Czy nazwa rekordu ze strefy DA oznacza `host` (`@`, `_dmarc`, `x._domainkey`). */
export function hostMatches(name: string, host: string, domain: string): boolean {
  const n = name.trim().toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase();
  if (host === '@') return n === '' || n === '@' || n === d;
  return n === host || n === `${host}.${d}`;
}

function zoneTxt(zone: ZoneRecord[] | null, host: string, domain: string, prefix: string): ZoneRecord | undefined {
  return zone?.find(
    (r) => r.type.toUpperCase() === 'TXT' && hostMatches(r.name, host, domain) && normTxt(r.value).toLowerCase().startsWith(prefix),
  );
}

/** Zalecany SPF dla poczty wysyłanej z serwera Verris. */
export function recommendedSpf(ip: string | null): string {
  return `v=spf1 a mx${ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ` ip4:${ip}` : ''} ~all`;
}

// Mechanizm, który kiedyś podpowiadaliśmy, a który nie istnieje w DNS — SPF z nim
// kończy się permerror, czyli poczta domeny w ogóle nie przechodzi SPF.
const DEAD_INCLUDE = /\s+include:_spf\.verris\.pl(?=\s|$)/i;

/** Czy SPF wprost obejmuje serwer Verris (a / mx / ip4 serwera). */
export function spfCoversServer(spf: string, ip: string | null): boolean {
  const terms = spf.toLowerCase().split(/\s+/);
  return terms.some((t) => /^[+]?(a|mx)$/.test(t) || (!!ip && t === `ip4:${ip}`));
}

/** Dopisuje mechanizmy Verris przed końcowym `all` (albo na końcu, gdy go brak). */
export function mergeSpf(spf: string, ip: string | null): string {
  const base = normTxt(spf).replace(DEAD_INCLUDE, '');
  const add = recommendedSpf(ip).replace(/^v=spf1 | ~all$/g, '').split(' ');
  const terms = base.split(/\s+/);
  const missing = add.filter((a) => !terms.map((t) => t.toLowerCase().replace(/^\+/, '')).includes(a));
  const allIdx = terms.findIndex((t) => /^[~?+-]?all$/i.test(t));
  if (allIdx === -1) return [...terms, ...missing, '~all'].join(' ');
  terms.splice(allIdx, 0, ...missing);
  return terms.join(' ');
}

export function buildMailAuthChecks(i: MailAuthInput): MailAuthCheck[] {
  return [spfCheck(i), dkimCheck(i), dmarcCheck(i)];
}

function spfCheck(i: MailAuthInput): MailAuthCheck {
  const spfs = i.rootTxt.map(normTxt).filter((r) => r.toLowerCase().startsWith('v=spf1'));
  const inZone = zoneTxt(i.zone, '@', i.domain, 'v=spf1');
  const replaces = inZone ? { name: inZone.name, type: 'TXT', value: inZone.value } : undefined;
  const base = { key: 'spf' as const, label: 'SPF' };

  if (spfs.length === 0) {
    return {
      ...base,
      status: 'fail',
      detail: 'Brak rekordu SPF — serwery odbiorców nie wiedzą, kto może wysyłać pocztę z Twojej domeny, więc częściej trafia ona do spamu.',
      suggestion: { host: '@', type: 'TXT', value: inZone ? mergeSpf(inZone.value, i.sendingIp) : recommendedSpf(i.sendingIp), replaces },
    };
  }
  if (spfs.length > 1) {
    return {
      ...base,
      status: 'fail',
      detail: `Domena ma ${spfs.length} rekordy SPF, a dozwolony jest jeden — odbiorcy traktują to jako błąd. Zostaw jeden rekord (poniżej) i usuń pozostałe.`,
      suggestion: { host: '@', type: 'TXT', value: mergeSpf(spfs[0], i.sendingIp), replaces },
    };
  }
  const spf = spfs[0];
  if (DEAD_INCLUDE.test(spf)) {
    return {
      ...base,
      status: 'fail',
      detail: 'Rekord SPF odwołuje się do _spf.verris.pl, który nie istnieje — przez to SPF kończy się błędem. Zastąp go rekordem poniżej.',
      suggestion: { host: '@', type: 'TXT', value: mergeSpf(spf, i.sendingIp), replaces },
    };
  }
  if (!spfCoversServer(spf, i.sendingIp)) {
    return {
      ...base,
      status: 'warn',
      detail: `Rekord SPF nie wymienia wprost serwera Verris${i.sendingIp ? ` (${i.sendingIp})` : ''} — jeśli wysyłasz pocztę przez nasz serwer, dopisz go.`,
      suggestion: { host: '@', type: 'TXT', value: mergeSpf(spf, i.sendingIp), replaces },
    };
  }
  if (!/[~-]all$/i.test(spf)) {
    return {
      ...base,
      status: 'warn',
      detail: 'Rekord SPF nie kończy się na ~all ani -all, więc nie chroni przed podszywaniem się pod domenę.',
      suggestion: { host: '@', type: 'TXT', value: mergeSpf(spf.replace(/\s+[+?]?all$/i, ''), i.sendingIp), replaces },
    };
  }
  return { ...base, status: 'ok', detail: `Poprawny: ${spf}` };
}

function dkimCheck(i: MailAuthInput): MailAuthCheck {
  const base = { key: 'dkim' as const, label: 'DKIM' };
  if (i.dkimSelector) {
    return { ...base, status: 'ok', detail: `Poczta jest podpisywana kluczem DKIM (selektor „${i.dkimSelector}”).` };
  }
  const key = i.zone?.find(
    (r) => r.type.toUpperCase() === 'TXT' && /^[^.]+\._domainkey(\.|$)/i.test(r.name.trim()) && /p=/.test(normTxt(r.value)),
  );
  if (key) {
    const host = key.name.trim().replace(/\.$/, '').replace(new RegExp(`\\.${i.domain.replace(/\./g, '\\.')}$`, 'i'), '');
    return {
      ...base,
      status: 'warn',
      detail: 'Klucz DKIM jest w strefie DNS Verris, ale nie widać go w publicznym DNS — domena korzysta z innych serwerów DNS. Dodaj ten rekord u swojego dostawcy DNS.',
      suggestion: { host, type: 'TXT', value: normTxt(key.value), inZone: true },
    };
  }
  return {
    ...base,
    status: 'warn',
    detail: 'Nie widać klucza DKIM, więc poczta nie jest podpisywana. Włącz podpis — klucz utworzymy na serwerze i dopiszemy do strefy DNS.',
    action: 'enable-dkim',
  };
}

const DMARC_PREFIX = 'v=dmarc1';

function dmarcCheck(i: MailAuthInput): MailAuthCheck {
  const base = { key: 'dmarc' as const, label: 'DMARC' };
  const recs = i.dmarcTxt.map(normTxt).filter((r) => r.toLowerCase().startsWith(DMARC_PREFIX));
  const inZone = zoneTxt(i.zone, '_dmarc', i.domain, DMARC_PREFIX);
  const replaces = inZone ? { name: inZone.name, type: 'TXT', value: inZone.value } : undefined;
  if (recs.length === 0) {
    return {
      ...base,
      status: 'fail',
      detail: 'Brak rekordu DMARC — nic nie mówi odbiorcom, co zrobić z pocztą podszywającą się pod Twoją domenę.',
      suggestion: { host: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=quarantine; adkim=r; aspf=r', replaces },
    };
  }
  if (recs.length > 1) {
    return {
      ...base,
      status: 'fail',
      detail: `Domena ma ${recs.length} rekordy DMARC — odbiorcy ignorują wtedy wszystkie. Zostaw jeden.`,
      suggestion: { host: '_dmarc', type: 'TXT', value: recs.find((r) => !/p=none/i.test(r)) ?? recs[0], replaces },
    };
  }
  const policy = /(?:^|;)\s*p=(none|quarantine|reject)/i.exec(recs[0])?.[1]?.toLowerCase() ?? 'none';
  if (policy === 'none') {
    return {
      ...base,
      status: 'warn',
      detail: 'DMARC tylko monitoruje (p=none) — fałszywa poczta nadal dociera. Gdy SPF i DKIM działają, zaostrz politykę.',
      suggestion: { host: '_dmarc', type: 'TXT', value: recs[0].replace(/((?:^|;)\s*p=)none/i, '$1quarantine'), replaces },
    };
  }
  return { ...base, status: 'ok', detail: `Poprawny: polityka p=${policy}.` };
}

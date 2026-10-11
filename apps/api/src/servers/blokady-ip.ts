import { isIP } from 'net';
import { NodeTaskStatus } from '@verris/database';
import { wynikWyczyszczony } from './dane-zadan-wezla.js';

/**
 * F3.2 (D5) — wspólne dla blokad IP węzła i karty usługi (zadanie IP_BLOCKS, ops/scripts/node-ip-blocks.sh, fail2ban).
 * Odczyt wyniku węzła, stan z ostatnich zadań, adresy IP powiązane z klientem (logowania, zgłoszenie).
 */

/** Jeden adres IPv4/IPv6 w postaci kanonicznej (tak samo sprawdza skrypt węzła modułem ipaddress). */
export function kanonicznyIp(wpis: string | null | undefined): string | null {
  const s = (wpis ?? '').trim();
  if (!s || s.length > 45 || !/^[0-9a-fA-F:.]+$/.test(s)) return null;
  const v = isIP(s);
  if (v === 4) {
    const czesci = s.split('.');
    return czesci.every((c) => c === String(Number(c))) ? s : null;
  }
  if (v === 6) {
    try {
      // URL normalizuje IPv6 do postaci skróconej, małymi literami (RFC 5952) — to samo daje str(ipaddress) w Pythonie.
      const n = new URL(`http://[${s}]/`).hostname.slice(1, -1);
      return n === s ? s : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Jail fail2ban → powód blokady dla operatora (jaile z ops/scripts/security-hardening-baseline.sh). */
const POWODY: Record<string, string> = {
  sshd: 'nieudane logowania SSH',
  directadmin: 'nieudane logowania do panelu serwera',
  exim: 'nieudane logowania SMTP (wysyłka poczty)',
  dovecot: 'nieudane logowania IMAP/POP3 (odbiór poczty)',
  'pure-ftpd': 'nieudane logowania FTP',
};
export const powodBlokady = (jail: string) => POWODY[jail] ?? `reguła ${jail}`;

export interface BlokadaIp {
  ip: string;
  jail: string;
  powod: string;
  od: string | null;
  do: string | null;
  stala: boolean;
}

export interface WynikBlokad {
  jaile: string[];
  blokady: BlokadaIp[];
  razem: number | null;
  pokazano: number | null;
  bialaLista: string[];
  odblokowano: number | null;
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

export function blokadyZLogu(log: string | null): WynikBlokad {
  const w: WynikBlokad = { jaile: [], blokady: [], razem: null, pokazano: null, bialaLista: [], odblokowano: null };
  for (const l of (log ?? '').split('\n')) {
    const j = /^VERRIS_IPB_JAIL ([A-Za-z0-9_.-]{1,64})$/.exec(l);
    if (j && w.jaile.length < 50) w.jaile.push(j[1]);
    const b = /^VERRIS_IPB ([0-9a-f:.]{2,45})\|([A-Za-z0-9_.-]{1,64})\|([^|]{1,25})\|([^|]{1,25})\|(-?\d{1,12})$/.exec(l);
    if (b && kanonicznyIp(b[1]) && w.blokady.length < 2000) {
      const sekundy = Number(b[5]);
      w.blokady.push({
        ip: b[1],
        jail: b[2],
        powod: powodBlokady(b[2]),
        od: ISO.test(b[3]) ? b[3] : null,
        do: ISO.test(b[4]) ? b[4] : null,
        stala: sekundy < 0,
      });
    }
    const r = /^VERRIS_IPB_RAZEM (\d+) (\d+)$/.exec(l);
    if (r) {
      w.razem = Number(r[1]);
      w.pokazano = Number(r[2]);
    }
    const a = /^VERRIS_IPB_ALLOW (\S{2,45})$/.exec(l);
    if (a && kanonicznyIp(a[1]) && w.bialaLista.length < 200) w.bialaLista.push(a[1]);
    const o = /^VERRIS_IPB_ODBLOKOWANO (\d+)$/.exec(l);
    if (o) w.odblokowano = Number(o[1]);
  }
  return w;
}

export function bladBlokad(log: string | null, errorMessage: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.includes('[ip-blocks] BŁĄD: '));
  if (l) return l.slice(l.indexOf('[ip-blocks] BŁĄD: ') + '[ip-blocks] BŁĄD: '.length).slice(0, 300);
  return (errorMessage ?? 'Zadanie na węźle nie powiodło się.').slice(0, 300);
}

export type ZadanieBlokad = {
  id: string;
  status: NodeTaskStatus;
  payload: unknown;
  outputLog: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type TrybBlokad = 'list' | 'unban' | 'allow' | 'disallow';
const parametry = (z: ZadanieBlokad) => (z.payload ?? {}) as { mode?: TrybBlokad; ip?: string };
const trwa = (z: ZadanieBlokad) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING;
const kiedy = (z: ZadanieBlokad) => (z.completedAt ?? z.createdAt).toISOString();

/**
 * Stan z ostatnich zadań IP_BLOCKS (najnowsze pierwsze). Lista = ostatnie ukończone zadanie z pełną listą węzła
 * (wszystko poza „sprawdź IP”); sprawdzenie = ostatnie „sprawdź IP”; operacja = ostatnie odblokowanie / zmiana listy.
 * `tylkoIp` zawęża wszystko do jednego adresu (karta usługi — L2 nie widzi blokad innych klientów).
 */
export function stanBlokad(zadania: ZadanieBlokad[], tylkoIp?: string | null) {
  const zawez = (w: WynikBlokad): WynikBlokad =>
    tylkoIp
      ? { ...w, blokady: w.blokady.filter((b) => b.ip === tylkoIp), razem: null, pokazano: null, bialaLista: w.bialaLista.filter((a) => a === tylkoIp) }
      : w;
  // Audyt Fali 3 — wynik wyczyszczony retencją (30 dni) to „nie wczytano”, nie „brak blokad”.
  const pelna = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && z.outputLog !== null && !(parametry(z).mode === 'list' && parametry(z).ip)) ?? null;
  const sprawdzenie = zadania.find((z) => parametry(z).mode === 'list' && parametry(z).ip && !wynikWyczyszczony(z)) ?? null;
  const operacja = zadania.find((z) => parametry(z).mode !== 'list') ?? null;
  const ostatnia = zadania[0] ?? null;
  return {
    wToku: zadania.some(trwa),
    lista: pelna ? { kiedy: kiedy(pelna), ...zawez(blokadyZLogu(pelna.outputLog)) } : null,
    sprawdzenie: sprawdzenie
      ? {
          ip: parametry(sprawdzenie).ip ?? '',
          wToku: trwa(sprawdzenie),
          kiedy: kiedy(sprawdzenie),
          blokady: sprawdzenie.status === NodeTaskStatus.COMPLETED ? blokadyZLogu(sprawdzenie.outputLog).blokady : [],
          blad: sprawdzenie.status === NodeTaskStatus.FAILED ? bladBlokad(sprawdzenie.outputLog, sprawdzenie.errorMessage) : null,
        }
      : null,
    operacja: operacja
      ? {
          tryb: parametry(operacja).mode ?? 'unban',
          ip: parametry(operacja).ip ?? '',
          wToku: trwa(operacja),
          kiedy: kiedy(operacja),
          odblokowano: operacja.status === NodeTaskStatus.COMPLETED ? blokadyZLogu(operacja.outputLog).odblokowano : null,
          blad: operacja.status === NodeTaskStatus.FAILED ? bladBlokad(operacja.outputLog, operacja.errorMessage) : null,
        }
      : null,
    blad: ostatnia?.status === NodeTaskStatus.FAILED ? bladBlokad(ostatnia.outputLog, ostatnia.errorMessage) : null,
  };
}

/**
 * Adresy IP zapisane w treści (zgłoszenie klienta: „mój adres to 203.0.113.7”). Tylko poprawne adresy w postaci
 * kanonicznej; IPv6 — ciągi z co najmniej dwoma „:”.
 */
export function adresyWTekscie(tekst: string | null | undefined, limit = 50): string[] {
  const out = new Set<string>();
  const t = tekst ?? '';
  for (const m of t.matchAll(/(?<![0-9A-Za-z.:])(\d{1,3}(?:\.\d{1,3}){3})(?![0-9A-Za-z]|\.\d)/g)) {
    const ip = kanonicznyIp(m[1]);
    if (ip) out.add(ip);
  }
  for (const m of t.matchAll(/(?<![0-9A-Za-z:])([0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7})(?![0-9A-Za-z:])/g)) {
    const surowy = m[1].toLowerCase();
    if (!isIP(surowy)) continue;
    try {
      out.add(new URL(`http://[${surowy}]/`).hostname.slice(1, -1));
    } catch {
      /* nie IPv6 */
    }
  }
  return [...out].slice(0, limit);
}

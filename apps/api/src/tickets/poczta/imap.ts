import * as tls from 'node:tls';
import type { Duplex } from 'node:stream';

/**
 * F3.7 (D6) — minimalny klient IMAP do skrzynek zespołu (Dovecot control-plane-mail). Tylko to, czego potrzebuje
 * import zgłoszeń: LOGIN, SELECT, UID SEARCH, UID FETCH (BODY.PEEK — bez zmiany flagi \Seen, więc zespół dalej widzi
 * maile jako nieprzeczytane w SOGo), UID STORE słowa kluczowego, LOGOUT. Pisany ręcznie jak klient SMTP
 * (mail/smtp-mailer.provider.ts) — mała powierzchnia zaufania, bez nowych zależności.
 *
 * Protokół: IMAP4rev1, RFC 3501 https://www.rfc-editor.org/rfc/rfc3501 — odpowiedzi z literałami `{n}\r\n`
 * (§4.3), SEARCH (§6.4.4), FETCH BODY.PEEK[] / RFC822.SIZE (§6.4.5), STORE +FLAGS.SILENT (§6.4.6), słowa kluczowe
 * (flag-keyword, §2.3.2). Błąd serwera (NO/BAD/BYE) = wyjątek — bez cichego „sukcesu”.
 */

export class BladImap extends Error {}

/** Jedna odpowiedź serwera: tekst linii (literały zastąpione `{n}`) i treści literałów w kolejności. */
export interface LiniaImap {
  tekst: string;
  literaly: Buffer[];
}

export interface OpcjeImap {
  /** Limit jednego literału (cała wiadomość) — większe przerywają połączenie. */
  maxLiteral: number;
  /** Limit czasu na odpowiedź serwera. */
  timeoutMs: number;
}

const CRLF = Buffer.from('\r\n');

export class PolaczenieImap {
  private bufor: Buffer = Buffer.alloc(0);
  private czeka: (() => void) | null = null;
  private blad: Error | null = null;
  private zamkniete = false;
  private nr = 0;

  constructor(
    private readonly gniazdo: Duplex,
    private readonly opcje: OpcjeImap = { maxLiteral: 32 * 1024 * 1024, timeoutMs: 60_000 },
  ) {
    gniazdo.on('data', (c: Buffer) => {
      this.bufor = this.bufor.length ? Buffer.concat([this.bufor, c]) : c;
      this.obudz();
    });
    gniazdo.on('error', (e: Error) => {
      this.blad = e;
      this.obudz();
    });
    gniazdo.on('close', () => {
      this.zamkniete = true;
      this.obudz();
    });
  }

  private obudz() {
    const c = this.czeka;
    this.czeka = null;
    c?.();
  }

  private async czekajNaDane(): Promise<void> {
    if (this.blad) throw new BladImap(`Połączenie IMAP: ${this.blad.message}`);
    if (this.zamkniete) throw new BladImap('Serwer IMAP zamknął połączenie.');
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        this.czeka = null;
        reject(new BladImap('Serwer IMAP nie odpowiada (limit czasu).'));
      }, this.opcje.timeoutMs);
      this.czeka = () => {
        clearTimeout(t);
        resolve();
      };
    });
    this.sprawdzBlad();
  }

  private sprawdzBlad(): void {
    const b = this.blad as Error | null;
    if (b) throw new BladImap(`Połączenie IMAP: ${b.message}`);
  }

  /** Jedna logiczna odpowiedź: linia, a gdy kończy się `{n}` — n bajtów literału i dalsza część linii. */
  async czytajLinie(): Promise<LiniaImap> {
    let tekst = '';
    const literaly: Buffer[] = [];
    for (;;) {
      let i = this.bufor.indexOf(CRLF);
      while (i < 0) {
        if (this.bufor.length > 1024 * 1024) throw new BladImap('Zbyt długa linia odpowiedzi IMAP.');
        await this.czekajNaDane();
        i = this.bufor.indexOf(CRLF);
      }
      const kawalek = this.bufor.subarray(0, i).toString('utf8');
      this.bufor = this.bufor.subarray(i + 2);
      tekst += kawalek;
      const lit = /\{(\d{1,10})\}$/.exec(kawalek);
      if (!lit) return { tekst, literaly };
      const n = Number(lit[1]);
      if (n > this.opcje.maxLiteral) throw new BladImap(`Literał IMAP większy niż limit (${n} B).`);
      while (this.bufor.length < n) await this.czekajNaDane();
      literaly.push(Buffer.from(this.bufor.subarray(0, n)));
      this.bufor = this.bufor.subarray(n);
    }
  }

  /** Powitanie serwera (`* OK`). */
  async powitanie(): Promise<void> {
    const l = await this.czytajLinie();
    if (!/^\* (OK|PREAUTH)\b/i.test(l.tekst)) throw new BladImap(`Nieoczekiwane powitanie IMAP: ${l.tekst.slice(0, 120)}`);
  }

  /**
   * Komenda z tagiem; zwraca odpowiedzi nieoznaczone. NO/BAD/BYE → wyjątek. `ukryj` — treść komendy nie trafia do
   * komunikatu błędu (LOGIN z hasłem).
   */
  async komenda(cmd: string, ukryj = false): Promise<LiniaImap[]> {
    if (/[\r\n]/.test(cmd)) throw new BladImap('Niedozwolony znak w komendzie IMAP.');
    const tag = `V${++this.nr}`;
    await new Promise<void>((resolve, reject) => this.gniazdo.write(`${tag} ${cmd}\r\n`, (e) => (e ? reject(e) : resolve())));
    const nieoznaczone: LiniaImap[] = [];
    for (;;) {
      const l = await this.czytajLinie();
      if (l.tekst.startsWith(`${tag} `)) {
        const status = l.tekst.slice(tag.length + 1);
        if (/^OK\b/i.test(status)) return nieoznaczone;
        const co = ukryj ? cmd.split(' ')[0] : cmd.slice(0, 80);
        throw new BladImap(`IMAP odrzucił ${co}: ${status.slice(0, 200)}`);
      }
      if (/^\* BYE\b/i.test(l.tekst) && !/^LOGOUT$/i.test(cmd)) throw new BladImap(`Serwer IMAP zakończył sesję: ${l.tekst.slice(0, 200)}`);
      nieoznaczone.push(l);
    }
  }

  async zaloguj(login: string, haslo: string): Promise<void> {
    await this.komenda(`LOGIN ${cytuj(login)} ${cytuj(haslo)}`, true);
  }

  async wybierz(folder = 'INBOX'): Promise<void> {
    await this.komenda(`SELECT ${cytuj(folder)}`);
  }

  /** UID wiadomości bez słowa kluczowego, otrzymanych od `od` (data bez godziny, RFC 3501 SINCE). */
  async szukajBezSlowa(slowo: string, od: Date): Promise<number[]> {
    assertSlowo(slowo);
    const odp = await this.komenda(`UID SEARCH UNKEYWORD ${slowo} SINCE ${dataImap(od)}`);
    const uid: number[] = [];
    for (const l of odp) {
      const m = /^\* SEARCH\b(.*)$/i.exec(l.tekst);
      if (m) for (const x of m[1].trim().split(/\s+/)) if (/^\d+$/.test(x)) uid.push(Number(x));
    }
    return uid.sort((a, b) => a - b);
  }

  /** Rozmiar i nagłówki (bez treści) — przed pobraniem całości (limit rozmiaru). */
  async naglowki(uid: number): Promise<{ rozmiar: number; naglowki: Buffer }> {
    const odp = await this.komenda(`UID FETCH ${uidOk(uid)} (UID RFC822.SIZE BODY.PEEK[HEADER])`);
    const l = odp.find((x) => new RegExp(`\\bUID ${uid}\\b`).test(x.tekst) && /\bFETCH\b/i.test(x.tekst));
    const r = l && /RFC822\.SIZE (\d+)/i.exec(l.tekst);
    if (!l || !r || !l.literaly[0]) throw new BladImap(`Brak nagłówków wiadomości UID ${uid}.`);
    return { rozmiar: Number(r[1]), naglowki: l.literaly[0] };
  }

  /** Cała wiadomość (BODY.PEEK[] — bez ustawiania \Seen). */
  async wiadomosc(uid: number): Promise<Buffer> {
    const odp = await this.komenda(`UID FETCH ${uidOk(uid)} (UID BODY.PEEK[])`);
    const l = odp.find((x) => new RegExp(`\\bUID ${uid}\\b`).test(x.tekst) && /\bFETCH\b/i.test(x.tekst));
    if (!l?.literaly[0]) throw new BladImap(`Brak treści wiadomości UID ${uid}.`);
    return l.literaly[0];
  }

  async oznacz(uid: number, slowo: string): Promise<void> {
    assertSlowo(slowo);
    await this.komenda(`UID STORE ${uidOk(uid)} +FLAGS.SILENT (${slowo})`);
  }

  async wyloguj(): Promise<void> {
    try {
      await this.komenda('LOGOUT');
    } catch {
      /* sesja i tak się kończy */
    } finally {
      this.gniazdo.destroy();
    }
  }

  zamknij(): void {
    this.gniazdo.destroy();
  }
}

/** quoted string (RFC 3501 §4.3): `\` i `"` poprzedzone `\`; CR/LF i znaki spoza ASCII odrzucone. */
export function cytuj(s: string): string {
  if (!/^[\x20-\x7e]*$/.test(s)) throw new BladImap('Login, hasło i folder IMAP: tylko znaki ASCII bez znaków końca linii.');
  return `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

function assertSlowo(s: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(s)) throw new BladImap('Nieprawidłowe słowo kluczowe IMAP.');
}

function uidOk(uid: number): number {
  if (!Number.isInteger(uid) || uid < 1) throw new BladImap('Nieprawidłowy UID.');
  return uid;
}

const MIESIACE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** date (RFC 3501 §9): „11-Oct-2026” (UTC). */
export function dataImap(d: Date): string {
  return `${d.getUTCDate()}-${MIESIACE[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** SHA-256 odcisku certyfikatu: „AA:BB:…” albo „aabb…” → „AABB…”. */
export const normalizujOdcisk = (s: string) => s.replace(/[^0-9a-f]/gi, '').toUpperCase();

/**
 * Połączenie TLS (IMAPS, port 993). Domyślnie pełna weryfikacja certyfikatu z nazwą hosta. Gdy skrzynki zespołu stoją
 * na certyfikacie samopodpisanym (Dovecot ze snakeoil — ops/scripts/prod-sogo-mail-bootstrap.sh), zamiast wyłączać
 * weryfikację przypinamy odcisk SHA-256 certyfikatu (`odcisk`): inny certyfikat = przerwanie przed wysłaniem hasła.
 */
export function polaczTls(o: { host: string; port: number; odcisk?: string; timeoutMs: number }): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const przypiety = o.odcisk ? normalizujOdcisk(o.odcisk) : null;
    const s = tls.connect({
      host: o.host,
      port: o.port,
      servername: /^[\d.:]+$/.test(o.host) ? undefined : o.host,
      ...(przypiety ? { rejectUnauthorized: false, checkServerIdentity: () => undefined } : {}),
    });
    const t = setTimeout(() => {
      s.destroy();
      reject(new BladImap('Brak połączenia z serwerem IMAP (limit czasu).'));
    }, o.timeoutMs);
    s.once('secureConnect', () => {
      clearTimeout(t);
      if (przypiety) {
        const fp = normalizujOdcisk(s.getPeerCertificate()?.fingerprint256 ?? '');
        if (fp !== przypiety) {
          s.destroy();
          reject(new BladImap('Certyfikat serwera IMAP nie zgadza się z przypiętym odciskiem — przerwano przed logowaniem.'));
          return;
        }
      }
      resolve(s);
    });
    s.once('error', (e) => {
      clearTimeout(t);
      reject(new BladImap(`Połączenie IMAP: ${e.message}`));
    });
  });
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Writable } from 'node:stream';
import * as net from 'node:net';
import { Client as SshClient, type SFTPWrapper } from 'ssh2';
import { Client as FtpClient, FTPError } from 'basic-ftp';
import { AuditService } from '../common/audit/audit.service.js';
import { MigrationActions } from '../common/audit/audit.actions.js';
import { resolvePublicHost } from './migration-net.util.js';
import {
  PLIKI_KONFIGURACJI,
  hostBazyDlaFormularza,
  parsujKonfiguracje,
  plikDoOdczytu,
  type Cms,
} from './migracja-konfiguracja-cms.js';

/**
 * 14.10 (uwagi Dominika po e2e PB-45) — źródło plików migracji bez wybierania protokołu:
 *
 * 1. **Test połączenia** — klient albo obsługa podaje host, login i hasło. Próbujemy po kolei SFTP (port 22 albo
 *    podany), FTPS (AUTH TLS, 21) i na końcu FTP bez szyfrowania; pierwszy udany protokół trafia do zlecenia.
 *    Przy SFTP sprawdzamy jeszcze, czy na starym serwerze jest rsync (najszybsze kopiowanie z deltą, worker
 *    i tak spada na lftp, gdy go nie ma).
 * 2. **Podgląd katalogów** — lista katalogów pod ścieżką (tylko odczyt), znacznik „wygląda na stronę” i — gdy
 *    jest plik konfiguracyjny CMS-a — dane bazy do podstawienia w formularzu.
 *
 * Bezpieczeństwo (jak preflight): host musi rozwiązać się na publiczny adres spoza Verris (resolvePublicHost —
 * SSRF), łączymy się z tym IP, a kanał danych FTP idzie na IP kanału sterującego (allowSeparateTransferHost:
 * false — serwer nie wskaże nam innego hosta, „FTP bounce”). Nic nie zapisujemy na starym serwerze.
 */

export type ProtokolPlikow = 'sftp' | 'ftps' | 'ftp';

export interface DostepPlikow {
  host: string;
  port?: number;
  username: string;
  password: string;
  protocol?: ProtokolPlikow;
}

export interface ProbaPolaczenia {
  protocol: ProtokolPlikow;
  port: number;
  status: 'ok' | 'auth_failed' | 'unreachable';
  message: string;
}

export interface WynikTestuPlikow {
  ok: boolean;
  protocol: ProtokolPlikow | null;
  port: number | null;
  /** Tylko SFTP: na starym serwerze jest rsync i dostęp do powłoki. */
  rsync: boolean;
  /** Krótko dla człowieka: czym będziemy kopiować. */
  metoda: string;
  /** Hasło poszło otwartym tekstem (FTP bez TLS). */
  nieszyfrowane: boolean;
  proby: ProbaPolaczenia[];
}

export interface WynikKatalogow {
  sciezka: string;
  katalogi: string[];
  /** Lista ucięta do LIMIT_WPISOW. */
  uciete: boolean;
  /** W katalogu są pliki strony (index.php / index.html / .htaccess / wp-config.php). */
  strona: boolean;
  cms: { cms: Cms; nazwa: string; plik: string } | null;
  /** Dane bazy z pliku konfiguracyjnego; `haslo` tylko, gdy wołający może je zobaczyć. */
  baza: { host: string; port: number | null; nazwa: string; uzytkownik: string; haslo?: string; hasloZPliku: boolean } | null;
}

const TIMEOUT_MS = 12_000;
const LIMIT_WPISOW = 500;
const MAKS_PLIK_KONFIGURACJI = 256 * 1024;
const PLIKI_STRONY = ['index.php', 'index.html', 'index.htm', '.htaccess', 'wp-config.php'];

/** Serwer odrzucił login lub hasło — w odróżnieniu od braku połączenia. */
export class BladLogowania extends Error {}

/** Kolejność prób: podany protokół/port albo SFTP → FTPS → FTP, z podanym portem tam, gdzie pasuje. */
export function kolejnoscProb(d: Pick<DostepPlikow, 'port' | 'protocol'>): Array<{ protocol: ProtokolPlikow; port: number }> {
  const domyslny = (p: ProtokolPlikow) => (p === 'sftp' ? 22 : 21);
  if (d.protocol) return [{ protocol: d.protocol, port: d.port ?? domyslny(d.protocol) }];
  const lista: Array<{ protocol: ProtokolPlikow; port: number }> = [];
  const dodaj = (protocol: ProtokolPlikow, port: number) => {
    if (!lista.some((x) => x.protocol === protocol && x.port === port)) lista.push({ protocol, port });
  };
  const p = d.port;
  if (p && p !== 21 && p !== 22) {
    // Nietypowy port: najpierw na nim (SFTP, FTPS, FTP), potem standardowe.
    dodaj('sftp', p);
    dodaj('ftps', p);
    dodaj('ftp', p);
  }
  if (p === 21) {
    dodaj('ftps', 21);
    dodaj('ftp', 21);
  }
  dodaj('sftp', 22);
  dodaj('ftps', 21);
  dodaj('ftp', 21);
  return lista;
}

function metodaKopiowania(protocol: ProtokolPlikow, rsync: boolean): string {
  if (protocol === 'sftp') return rsync ? 'SFTP + rsync — najszybciej, z dosyłaniem zmian' : 'SFTP (bez rsync na starym serwerze)';
  return protocol === 'ftps' ? 'FTPS (FTP z szyfrowaniem)' : 'FTP bez szyfrowania';
}

function bezZnakowSterujacych(...v: string[]) {
  for (const x of v) if (/[\x00-\x1f\x7f]/.test(x)) throw new BadRequestException('Dane logowania zawierają znaki sterujące.');
}

/** Ścieżka katalogu: zawsze absolutna, bez `..` (DTO pilnuje znaków), bez podwójnych ukośników. */
export function normalizujSciezke(s: string): string {
  const czesci = s.split('/').filter((c) => c && c !== '.');
  if (czesci.some((c) => c === '..')) throw new BadRequestException('Ścieżka nie może wychodzić w górę drzewa (..).');
  return '/' + czesci.join('/');
}

// ----------------------------------------------------------------------------------------------------------
// Połączenia (wstrzykiwalne w testach)
// ----------------------------------------------------------------------------------------------------------

interface SesjaPlikow {
  listuj(sciezka: string): Promise<{ katalogi: string[]; pliki: string[] }>;
  /** Treść pliku do MAKS bajtów; null, gdy pliku nie ma albo jest za duży. */
  czytaj(sciezka: string, maks: number): Promise<string | null>;
  rsync(): Promise<boolean>;
  zamknij(): void;
}

export type Polacz = (o: { ip: string; host: string; port: number; protocol: ProtokolPlikow; username: string; password: string }) => Promise<SesjaPlikow>;

const polaczSftp: Polacz = (o) =>
  new Promise((resolve, reject) => {
    const c = new SshClient();
    let gotowe = false;
    c.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => finish(prompts.map(() => o.password)));
    c.on('error', (err: Error & { level?: string }) => {
      if (gotowe) return;
      gotowe = true;
      reject(err.level === 'client-authentication' ? new BladLogowania('Serwer SSH odrzucił login lub hasło.') : err);
    });
    c.on('ready', () => {
      c.sftp((err, sftp: SFTPWrapper) => {
        if (err) {
          gotowe = true;
          c.end();
          return reject(new Error(`SFTP niedostępne na tym koncie: ${err.message}`));
        }
        gotowe = true;
        resolve({
          listuj: (sciezka) =>
            new Promise((res, rej) =>
              sftp.readdir(sciezka, (e, lista) => {
                if (e) return rej(new BadRequestException(`Nie można otworzyć katalogu ${sciezka}: ${e.message}`));
                const katalogi: string[] = [];
                const pliki: string[] = [];
                for (const w of lista) (w.attrs.isDirectory() ? katalogi : pliki).push(w.filename);
                res({ katalogi, pliki });
              }),
            ),
          czytaj: (sciezka, maks) =>
            new Promise((res) =>
              sftp.stat(sciezka, (e, st) => {
                if (e || !st.isFile() || st.size > maks) return res(null);
                sftp.readFile(sciezka, (e2, buf) => res(e2 ? null : buf.toString('utf8')));
              }),
            ),
          // `command -v` wymaga powłoki — konto tylko-SFTP odmówi exec i to też znaczy „bez rsync”.
          rsync: () =>
            new Promise((res) => {
              const t = setTimeout(() => res(false), 5000);
              c.exec('command -v rsync >/dev/null 2>&1 && echo TAK', (e, stream) => {
                if (e) {
                  clearTimeout(t);
                  return res(false);
                }
                let out = '';
                stream.on('data', (d: Buffer) => (out += d.toString()));
                stream.on('close', () => {
                  clearTimeout(t);
                  res(out.includes('TAK'));
                });
                stream.stderr.on('data', () => undefined);
              });
            }),
          zamknij: () => c.end(),
        });
      });
    });
    c.connect({
      host: o.ip,
      port: o.port,
      username: o.username,
      password: o.password,
      readyTimeout: TIMEOUT_MS,
      tryKeyboard: true,
      // Test i podgląd poświadczeń, nie kanał przesyłu (ten idzie z węzła z własną weryfikacją) — jak preflight.
      hostVerifier: () => true,
    });
  });

const polaczFtp: Polacz = async (o) => {
  const c = new FtpClient(TIMEOUT_MS, { allowSeparateTransferHost: false, maxListingBytes: 5 * 1024 * 1024 });
  try {
    await c.access({
      host: o.ip,
      port: o.port,
      user: o.username,
      password: o.password,
      secure: o.protocol === 'ftps',
      secureOptions: { rejectUnauthorized: false, ...(net.isIP(o.host) ? {} : { servername: o.host }) },
    });
  } catch (err) {
    c.close();
    if (err instanceof FTPError && err.code === 530) throw new BladLogowania('Serwer FTP odrzucił login lub hasło.');
    throw err;
  }
  return {
    listuj: async (sciezka) => {
      const lista = await c.list(sciezka).catch((e: Error) => {
        throw new BadRequestException(`Nie można otworzyć katalogu ${sciezka}: ${e.message}`);
      });
      return {
        katalogi: lista.filter((w) => w.isDirectory).map((w) => w.name),
        pliki: lista.filter((w) => !w.isDirectory).map((w) => w.name),
      };
    },
    czytaj: async (sciezka, maks) => {
      const rozmiar = await c.size(sciezka).catch(() => -1);
      if (rozmiar < 0 || rozmiar > maks) return null;
      const czesci: Buffer[] = [];
      const cel = new Writable({ write: (ch: Buffer, _e, cb) => (czesci.push(ch), cb()) });
      return c.downloadTo(cel, sciezka).then(
        () => Buffer.concat(czesci).toString('utf8'),
        () => null,
      );
    },
    rsync: async () => false,
    zamknij: () => c.close(),
  };
};

const polaczDomyslnie: Polacz = (o) => (o.protocol === 'sftp' ? polaczSftp(o) : polaczFtp(o));

// ----------------------------------------------------------------------------------------------------------

@Injectable()
export class MigracjaZrodloPlikowService {
  private readonly logger = new Logger(MigracjaZrodloPlikowService.name);
  /** Testy podmieniają połączenie (bez prawdziwych serwerów). */
  polacz: Polacz = polaczDomyslnie;

  constructor(private readonly audit: AuditService) {}

  async testPolaczenia(d: DostepPlikow, kto: { userId: string; actorUserId: string; subscriptionId: string }): Promise<WynikTestuPlikow> {
    bezZnakowSterujacych(d.username, d.password);
    const ip = await resolvePublicHost(d.host); // BadRequest dla adresów prywatnych i serwerów Verris
    const proby: ProbaPolaczenia[] = [];
    let wynik: WynikTestuPlikow | null = null;
    for (const p of kolejnoscProb(d)) {
      try {
        const s = await this.polacz({ ip, host: d.host, port: p.port, protocol: p.protocol, username: d.username, password: d.password });
        let rsync = false;
        try {
          rsync = p.protocol === 'sftp' ? await s.rsync() : false;
        } finally {
          s.zamknij();
        }
        proby.push({ ...p, status: 'ok', message: 'Zalogowano.' });
        wynik = {
          ok: true,
          protocol: p.protocol,
          port: p.port,
          rsync,
          metoda: metodaKopiowania(p.protocol, rsync),
          nieszyfrowane: p.protocol === 'ftp',
          proby,
        };
        break;
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        const auth = err instanceof BladLogowania;
        proby.push({ ...p, status: auth ? 'auth_failed' : 'unreachable', message: auth ? err.message : `Brak połączenia: ${(err as Error).message}` });
      }
    }
    wynik ??= {
      ok: false,
      protocol: null,
      port: null,
      rsync: false,
      // Odrzucony login mówi więcej niż „brak połączenia” na pozostałych portach.
      metoda: proby.some((x) => x.status === 'auth_failed') ? 'Serwer odrzucił login lub hasło' : 'Nie udało się połączyć żadnym sposobem',
      nieszyfrowane: false,
      proby,
    };
    await this.audit.record({
      action: MigrationActions.MIGRATION_PREFLIGHT_RUN,
      userId: kto.userId,
      actorUserId: kto.actorUserId,
      details: { subscriptionId: kto.subscriptionId, rodzaj: 'test-polaczenia-plikow', ok: wynik.ok, proby: proby.map(({ protocol, port, status }) => ({ protocol, port, status })) },
    });
    return wynik;
  }

  async katalogi(
    d: DostepPlikow & { protocol: ProtokolPlikow; sciezka: string },
    opcje: { zHaslemBazy: boolean },
  ): Promise<WynikKatalogow> {
    bezZnakowSterujacych(d.username, d.password);
    const sciezka = normalizujSciezke(d.sciezka);
    const ip = await resolvePublicHost(d.host);
    let s: SesjaPlikow;
    try {
      s = await this.polacz({ ip, host: d.host, port: d.port ?? (d.protocol === 'sftp' ? 22 : 21), protocol: d.protocol, username: d.username, password: d.password });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(err instanceof BladLogowania ? err.message : `Brak połączenia: ${(err as Error).message}`);
    }
    try {
      const { katalogi, pliki } = await s.listuj(sciezka);
      const posortowane = katalogi.filter((k) => k !== '.' && k !== '..').sort((a, b) => a.localeCompare(b, 'pl'));
      const strona = pliki.some((p) => PLIKI_STRONY.includes(p));
      let cms: WynikKatalogow['cms'] = null;
      let baza: WynikKatalogow['baza'] = null;
      const kandydat = plikDoOdczytu({ pliki, katalogi: posortowane });
      // PrestaShop 1.7 bez parameters.php = 1.6 (settings.inc.php) — te same katalogi.
      const kandydaci = kandydat
        ? kandydat.cms === 'prestashop'
          ? [kandydat, PLIKI_KONFIGURACJI.find((x) => x.cms === 'prestashop16')!]
          : [kandydat]
        : [];
      for (const k of kandydaci) {
        const tresc = await s.czytaj(`${sciezka === '/' ? '' : sciezka}/${k.plik}`, MAKS_PLIK_KONFIGURACJI);
        if (tresc == null) continue;
        cms = { cms: k.cms, nazwa: k.nazwa, plik: k.plik };
        const dane = parsujKonfiguracje(k.cms, tresc);
        if (dane) {
          baza = {
            host: hostBazyDlaFormularza(dane.host, d.host),
            port: dane.port,
            nazwa: dane.nazwa,
            uzytkownik: dane.uzytkownik,
            hasloZPliku: dane.haslo.length > 0,
            ...(opcje.zHaslemBazy ? { haslo: dane.haslo } : {}),
          };
        }
        break;
      }
      return { sciezka, katalogi: posortowane.slice(0, LIMIT_WPISOW), uciete: posortowane.length > LIMIT_WPISOW, strona: strona || !!cms, cms, baza };
    } finally {
      s.zamknij();
    }
  }
}

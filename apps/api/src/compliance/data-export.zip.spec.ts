import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { inflateRawSync } from 'zlib';
import { DataExportService } from './data-export.service';

/**
 * X-22 — eksport danych osobowych (RODO art. 20) sprawdzany end-to-end: prawdziwy
 * archiver 8 buduje prawdziwy ZIP na dysku, a test go rozpakowuje. Do 2026-08-22
 * eksport wywalał się w runtime przy każdym żądaniu (X-21) i nic tego nie złapało,
 * bo żaden test nie dotykał tej ścieżki.
 */

/** Minimalny czytnik ZIP (katalog centralny + deflate) — bez nowej zależności. */
function rozpakuj(buf: Buffer): Map<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('to nie jest ZIP');
  const ile = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < ile; i++) {
    const metoda = buf.readUInt16LE(p + 10);
    const rozmiar = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const lokalny = buf.readUInt32LE(p + 42);
    const nazwa = buf.subarray(p + 46, p + 46 + nLen).toString('utf8');
    const start = lokalny + 30 + buf.readUInt16LE(lokalny + 26) + buf.readUInt16LE(lokalny + 28);
    const dane = buf.subarray(start, start + rozmiar);
    out.set(nazwa, (metoda === 8 ? inflateRawSync(dane) : dane).toString('utf8'));
    p += 46 + nLen + eLen + cLen;
  }
  return out;
}

function zbuduj(opts: { brakujacyZalacznik?: boolean } = {}) {
  const lista = <T>(v: T) => jest.fn(async () => v);
  const prisma = {
    user: {
      findUniqueOrThrow: lista({
        id: 'u1', email: 'jan@firma.pl', passwordHash: '$2b$10$tajne', twoFactorSecret: 'SEKRET-TOTP', staffBreakGlassCodesEnc: 'enc:kody-awaryjne',
        twoFactorRecoveryCodesEnc: 'kody', createdAt: new Date('2026-01-01T00:00:00Z'), walletBalance: BigInt(4500),
      }),
    },
    account: { findMany: lista([{ id: 'a1', domain: 'x.pl', daPasswordEnc: 'enc:haslo-da' }]) },
    subscription: { findMany: lista([{ id: 's1' }]) },
    walletTransaction: { findMany: lista([]) },
    invoice: { findMany: lista([{ id: 'i1', number: 'FV/1/2026' }]) },
    ticket: { findMany: lista([{ id: 't1', subject: 'Pomoc' }]) },
    ticketAttachment: {
      findMany: lista([
        { id: 'z1', originalName: 'faktura.pdf', storageKey: 'k1' },
        { id: 'z2', originalName: 'faktura.pdf', storageKey: 'k2' },
        { id: 'z3', originalName: '../../etc/passwd', storageKey: 'k3' },
      ]),
    },
    ticketReply: { findMany: lista([]) },
    userConsent: { findMany: lista([{ id: 'c1', documentType: 'TERMS' }]) },
    marketingPreferences: { findUnique: lista({ userId: 'u1', marketingEmail: false }) },
    dataExportRequest: { findMany: lista([]) },
    accountDeletionRequest: { findMany: lista([]) },
    auditLog: { findMany: lista([]) },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  const storage = {
    getObjectStream: jest.fn(async (_b: string, key: string) => {
      if (opts.brakujacyZalacznik && key === 'k2') throw new Error('NoSuchKey');
      return Readable.from([Buffer.from(`zawartosc-${key}`)]);
    }),
  };
  const config = { get: jest.fn(() => undefined) };
  const svc = new DataExportService(prisma as never, {} as never, config as never, {} as never, storage as never);
  return { svc };
}

describe('X-22 — eksport RODO buduje prawdziwe archiwum', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'x22-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const zbudujZip = async (svc: DataExportService) => {
    const plik = join(dir, 'eksport.zip');
    await (svc as unknown as { buildZipToFile(u: string, p: string): Promise<void> }).buildZipToFile('u1', plik);
    return rozpakuj(readFileSync(plik));
  };

  it('archiwum zawiera README, sekcje JSON i załączniki zgłoszeń', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    for (const n of ['README.txt', 'profile.json', 'accounts.json', 'invoices.json', 'consents.json', 'tickets.json', 'marketing-preferences.json', '_meta.json']) {
      expect(pliki.has(n)).toBe(true);
    }
    expect(pliki.get('README.txt')).toContain('RODO art. 20');
    expect(JSON.parse(pliki.get('invoices.json')!)).toEqual([{ id: 'i1', number: 'FV/1/2026' }]);
    expect(pliki.get('attachments/faktura.pdf')).toBe('zawartosc-k1');
    expect(pliki.get('attachments/z2_faktura.pdf')).toBe('zawartosc-k2');
  });

  it('sekrety są zaczernione, a BigInt i daty serializują się poprawnie', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    const profil = JSON.parse(pliki.get('profile.json')!);
    expect(profil).toMatchObject({ passwordHash: '[REDACTED]', twoFactorSecret: '[REDACTED]', twoFactorRecoveryCodesEnc: '[REDACTED]', walletBalance: '4500', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(JSON.parse(pliki.get('accounts.json')!)[0].daPasswordEnc).toBe('[REDACTED]');
    const calosc = [...pliki.values()].join('\n');
    for (const sekret of ['$2b$10$tajne', 'SEKRET-TOTP', 'enc:haslo-da', 'enc:kody-awaryjne']) expect(calosc).not.toContain(sekret);
  });

  it('nazwa załącznika nie wychodzi poza katalog attachments/ (zip slip)', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    const nazwy = [...pliki.keys()];
    expect(nazwy.some((n) => n.includes('..') && n.includes('/etc/'))).toBe(false);
    expect(nazwy).toContain('attachments/.._.._etc_passwd');
  });

  it('brakujący obiekt w magazynie nie psuje eksportu — reszta archiwum powstaje', async () => {
    const pliki = await zbudujZip(zbuduj({ brakujacyZalacznik: true }).svc);
    expect(pliki.has('profile.json')).toBe(true);
    expect(pliki.has('attachments/faktura.pdf')).toBe(true);
    expect(pliki.has('attachments/z2_faktura.pdf')).toBe(false);
  });
});

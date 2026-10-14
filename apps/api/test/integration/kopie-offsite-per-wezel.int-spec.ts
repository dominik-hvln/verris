import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { CryptoService } from '../../src/common/crypto/crypto.service.js';
import { BackupOffsiteService } from '../../src/servers/backup-offsite.service.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Audyt 13.10 (#11, backup-offsite.service.ts:dlaWezla:fleet-wide-offsite-credentials-to-every-node): każdy węzeł
 * dostawał ten sam zestaw (subkonto + crypt) — root jednego węzła czytał, odszyfrowywał i kasował kopie całej floty.
 * Węzeł z własnym wpisem dostaje tylko swój; wspólny zestaw tylko w okresie przejściowym i do wyłączenia.
 */
const crypto = new CryptoService({ get: () => 'klucz-testowy-offsite' } as never);
const usluga = () => new BackupOffsiteService(prisma() as never, crypto, new AuditService(prisma() as never));
const env = (t: string) => Object.fromEntries(t.trim().split('\n').map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]));

async function flota() {
  const s = usluga();
  const admin = await prisma().user.create({ data: { email: `adm-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
  await s.zapisz({ host: 'u1.your-storagebox.de', port: 23, user: 'u1', sciezka: 'verris', retencjaDni: 30, pass: 'HASLO-FLOTY', cryptPass: 'CRYPT-FLOTY-0123456789', cryptSalt: 'SOL-FLOTY-0123456789' }, admin.id);
  const a = await utworzWezel();
  const b = await utworzWezel();
  return { s, admin, a, b };
}

describe('Kopie off-site per węzeł', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('węzły z własnymi wpisami nie dostają nic wspólnego (ani hasła subkonta, ani crypt)', async () => {
    const { s, admin, a, b } = await flota();
    await s.zapiszWezla(a.id, { host: 'u1.your-storagebox.de', port: 23, user: 'u1-sub1', sciezka: '', pass: 'HASLO-A', cryptPass: 'CRYPT-A-0123456789ab', cryptSalt: 'SOL-A-0123456789abcd' }, admin.id);
    await s.zapiszWezla(b.id, { host: 'u1.your-storagebox.de', port: 23, user: 'u1-sub2', sciezka: '', pass: 'HASLO-B', cryptPass: 'CRYPT-B-0123456789ab', cryptSalt: 'SOL-B-0123456789abcd' }, admin.id);
    const ea = env((await s.dlaWezla(a.id))!);
    const eb = env((await s.dlaWezla(b.id))!);
    expect(ea.VB_USER).toBe(`'u1-sub1'`);
    expect(eb.VB_USER).toBe(`'u1-sub2'`);
    for (const k of ['VB_USER', 'VB_PASS', 'VB_CRYPT_PASS', 'VB_CRYPT_SALT']) expect(ea[k]).not.toBe(eb[k]);
    for (const e of [ea, eb]) expect(Object.values(e).join(' ')).not.toMatch(/HASLO-FLOTY|CRYPT-FLOTY|SOL-FLOTY/);
    expect(ea.VB_RETENTION_DAYS).toBe(`'30'`);
  });

  it('okres przejściowy: węzeł bez wpisu dostaje wspólny zestaw (w audycie); „tylko per węzeł” → nic (404)', async () => {
    const { s, admin, a } = await flota();
    expect(env((await s.dlaWezla(a.id))!).VB_USER).toBe(`'u1'`);
    expect(await prisma().auditLog.count({ where: { action: 'BACKUP_OFFSITE_SHARED_READ_BY_NODE' } })).toBe(1);
    await s.ustawTylkoPerWezel(true, admin.id);
    expect(await s.dlaWezla(a.id)).toBeNull();
  });

  it('hasło crypt węzła nie może być wspólnym hasłem floty', async () => {
    const { s, admin, a } = await flota();
    await expect(
      s.zapiszWezla(a.id, { host: 'u1.your-storagebox.de', port: 23, user: 'u1-sub1', sciezka: '', pass: 'x', cryptPass: 'CRYPT-FLOTY-0123456789', cryptSalt: 'SOL-A-0123456789abcd' }, admin.id),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('H-16: dane RO źródła tylko dla węzła, który wykonuje to zadanie odtworzenia', async () => {
    const { s, admin, a, b } = await flota();
    await s.zapiszWezla(a.id, {
      host: 'u1.your-storagebox.de', port: 23, user: 'u1-sub1', sciezka: '', pass: 'HASLO-A',
      cryptPass: 'CRYPT-A-0123456789ab', cryptSalt: 'SOL-A-0123456789abcd', roUser: 'u1-sub1-ro', roPass: 'HASLO-A-RO',
    }, admin.id);
    await s.dlaWezla(a.id); // węzeł źródłowy pobrał własne dane — jego kopie są pod własnym kluczem
    const t = await prisma().nodeTask.create({
      data: { serverId: b.id, kind: NodeTaskKind.OFFSITE_RESTORE, status: NodeTaskStatus.RUNNING, payload: { mode: 'list', zrodloServerId: a.id } },
    });
    const e = env(await s.envDlaZadaniaOdtworzenia(t.id, b.id));
    expect(e).toMatchObject({ SRC_USER: `'u1-sub1-ro'`, SRC_PASS: `'HASLO-A-RO'`, SRC_CRYPT_PASS: `'CRYPT-A-0123456789ab'` });
    expect(Object.values(e).join(' ')).not.toContain('HASLO-A\'');
    // Inny węzeł, zadanie zakończone albo bez źródła → 404.
    await expect(s.envDlaZadaniaOdtworzenia(t.id, a.id)).rejects.toBeInstanceOf(NotFoundException);
    await prisma().nodeTask.update({ where: { id: t.id }, data: { status: NodeTaskStatus.COMPLETED } });
    await expect(s.envDlaZadaniaOdtworzenia(t.id, b.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('źródło z własnym wpisem bez subkonta RO → odtworzenie odmawia z jasnym powodem', async () => {
    const { s, admin, a } = await flota();
    await s.zapiszWezla(a.id, { host: 'u1.your-storagebox.de', port: 23, user: 'u1-sub1', sciezka: '', pass: 'HASLO-A', cryptPass: 'CRYPT-A-0123456789ab', cryptSalt: 'SOL-A-0123456789abcd' }, admin.id);
    await s.dlaWezla(a.id);
    await expect(s.daneOdczytuZrodla(a.id)).rejects.toThrow('tylko do odczytu');
  });

  // Przegląd 15.10: okres przejściowy H-16.
  it('źródło jeszcze na wspólnych danych, cel już na własnych → cel dostaje wspólne dane źródła na czas zadania', async () => {
    const { s, admin, a, b } = await flota();
    await s.zapiszWezla(b.id, { host: 'u1.your-storagebox.de', port: 23, user: 'u1-sub2', sciezka: '', pass: 'HASLO-B', cryptPass: 'CRYPT-B-0123456789ab', cryptSalt: 'SOL-B-0123456789abcd' }, admin.id);
    expect(await s.odtworzeniePotrzebujeDanychZrodla(a.id, b.id)).toBe(true);
    const t = await prisma().nodeTask.create({
      data: { serverId: b.id, kind: NodeTaskKind.OFFSITE_RESTORE, status: NodeTaskStatus.RUNNING, payload: { mode: 'list', zrodloServerId: a.id } },
    });
    expect(env(await s.envDlaZadaniaOdtworzenia(t.id, b.id))).toMatchObject({ SRC_USER: `'u1'`, SRC_PATH: `'verris'`, SRC_CRYPT_PASS: `'CRYPT-FLOTY-0123456789'` });
  });

  it('źródło z zapisanymi, ale jeszcze niepobranymi własnymi danymi → kopie czytamy wspólnym kluczem', async () => {
    const { s, admin, a, b } = await flota();
    await s.zapiszWezla(a.id, {
      host: 'u1.your-storagebox.de', port: 23, user: 'u1-sub1', sciezka: '', pass: 'HASLO-A',
      cryptPass: 'CRYPT-A-0123456789ab', cryptSalt: 'SOL-A-0123456789abcd', roUser: 'u1-sub1-ro', roPass: 'HASLO-A-RO',
    }, admin.id);
    expect(await s.odtworzeniePotrzebujeDanychZrodla(a.id, b.id)).toBe(false); // obaj na wspólnym — stary układ
    expect((await s.daneOdczytuZrodla(a.id))?.rodzaj).toBe('wspolne');
    await s.dlaWezla(a.id);
    expect((await s.daneOdczytuZrodla(a.id))?.rodzaj).toBe('wlasne');
  });
});

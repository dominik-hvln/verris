import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { createServer as tcpServer, type AddressInfo, type Server } from 'net';
import { createServer as tlsServer } from 'tls';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProbeKind } from '@verris/database';
import { PORTY_TLS, ProbeRunnerService } from './probe-runner.service.js';

/** 07.10 — IMAP na 993 (TLS od razu): zwykłe gniazdo nigdy nie widziało „* OK”, sonda zgłaszała awarię poczty. */
describe('sonda z powitaniem (SMTP/IMAP/POP3)', () => {
  const runner = new ProbeRunnerService();
  let serwer: Server | undefined;
  afterEach(() => {
    serwer?.close();
    serwer = undefined;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  });
  const port = () => (serwer!.address() as AddressInfo).port;
  const nasluch = (s: Server) => new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));

  it('port TLS (993): powitanie po uzgodnieniu TLS → działa', async () => {
    const kat = mkdtempSync(join(tmpdir(), 'sonda-tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
      '-keyout', join(kat, 'k.pem'), '-out', join(kat, 'c.pem')], { stdio: 'ignore' });
    serwer = tlsServer({ key: readFileSync(join(kat, 'k.pem')), cert: readFileSync(join(kat, 'c.pem')) }, (s) => s.write('* OK IMAP gotowy\r\n'));
    await nasluch(serwer);
    PORTY_TLS.add(port()); // port testowy udaje 993
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // certyfikat testowy jest samopodpisany
    try {
      await expect(runner.run(ProbeKind.IMAP, `localhost:${port()}`, 3000)).resolves.toMatchObject({ ok: true });
    } finally {
      PORTY_TLS.delete(port());
    }
  });

  it('zwykły port (587): powitanie od razu → działa; brak powitania → awaria', async () => {
    serwer = tcpServer((s) => s.write('220 t1 ESMTP\r\n'));
    await nasluch(serwer);
    await expect(runner.run(ProbeKind.SMTP, `127.0.0.1:${port()}`, 3000)).resolves.toMatchObject({ ok: true });
    serwer.close();
    serwer = tcpServer(() => undefined);
    await nasluch(serwer);
    await expect(runner.run(ProbeKind.SMTP, `127.0.0.1:${port()}`, 500)).resolves.toMatchObject({ ok: false, errorCode: 'timeout' });
  });
});

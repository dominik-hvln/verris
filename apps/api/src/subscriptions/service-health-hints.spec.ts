import { buildHealthCheckDetails } from './service-health-hints';

describe('buildHealthCheckDetails', () => {
  const meta = {
    domain: 'example.pl',
    serverIp: '1.2.3.4',
    dnsResolved: ['9.9.9.9'],
    siteTls: { ok: false, error: 'timeout' },
    panelHost: 'node.example.pl',
    panelTls: { ok: true, authorized: true },
    mailHost: 'node.example.pl',
    mailTls: { ok: false, error: 'ECONNREFUSED' },
    cpuUsageAvg: 95,
    cpuLimit: 100,
    backupCounted: true,
  };

  it('explains DNS mismatch for client', () => {
    const details = buildHealthCheckDetails(
      {
        dnsOk: false,
        tlsOk: false,
        backupFresh: true,
        lveOk: false,
        panelTlsOk: true,
        mailOk: false,
      },
      meta,
    );
    expect(details.dnsOk?.status).toBe('warn');
    expect(details.dnsOk?.explanation).toContain('9.9.9.9');
    expect(details.dnsOk?.whatToDo).toContain('Domeny & DNS');
    expect(details.mailOk?.whatToDo).toContain('Poczta');
  });
});

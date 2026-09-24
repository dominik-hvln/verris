import { buildHealthCheckDetails, opisBleduPolaczenia } from './service-health-hints';

describe('buildHealthCheckDetails', () => {
  const meta = {
    domain: 'example.pl',
    serverIp: '1.2.3.4',
    dnsResolved: ['9.9.9.9'],
    siteTls: { ok: false, error: 'timeout' },
    panelHost: 'node.example.pl',
    panelTls: { ok: true, authorized: true },
    mailHost: 'node.example.pl',
    mailPort: 993,
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

  it('nie pokazuje klientowi surowych błędów gniazda ani adresów infrastruktury', () => {
    const details = buildHealthCheckDetails(
      { dnsOk: true, tlsOk: false, backupFresh: true, lveOk: true, panelTlsOk: false, mailOk: false },
      { ...meta, panelTls: { ok: false, error: 'connect ECONNREFUSED 62.238.0.223:2222' } },
    );
    const teksty = [details.tlsOk, details.panelTlsOk, details.mailOk].map((d) => d?.explanation ?? '').join(' ');
    expect(teksty).not.toMatch(/ECONN|timeout|62\.238|\d+\.\d+\.\d+\.\d+:\d+/);
    expect(details.panelTlsOk?.explanation).toContain('serwer odrzuca połączenie');
    expect(details.tlsOk?.explanation).toContain('nie odpowiada na czas');
  });

  it.each([
    ['getaddrinfo ENOTFOUND x.pl', 'DNS'],
    ['certificate has expired', 'wygasł'],
    ['self-signed certificate', 'zaufany'],
    ["Hostname/IP does not match certificate's altnames", 'innej nazwy'],
    ['coś nieznanego 10.0.0.1', 'błąd połączenia'],
  ])('opisBleduPolaczenia(%s)', (surowy, fragment) => {
    expect(opisBleduPolaczenia(surowy)).toContain(fragment);
    expect(opisBleduPolaczenia(surowy)).not.toMatch(/\d+\.\d+/);
  });
});

import { promises as dns } from 'dns';
import { DeliverabilityService } from './deliverability.service';

/** E-18 — wynik sprawdzenia blacklist: „nie wiemy” nie może wyglądać jak „czysto”. */
describe('DeliverabilityService.check — RBL', () => {
  const svc = new DeliverabilityService({} as never, {} as never, {} as never);
  const rbl = async (odpowiedzi: Record<string, string[] | Error>) => {
    jest.spyOn(dns, 'resolveTxt').mockRejectedValue(Object.assign(new Error('x'), { code: 'ENOTFOUND' }));
    jest.spyOn(dns, 'resolve4').mockImplementation(async (name: string) => {
      const zone = Object.keys(odpowiedzi).find((z) => name.endsWith(z));
      const v = zone ? odpowiedzi[zone] : Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
      if (v instanceof Error) throw v;
      return v as string[];
    });
    const r = await svc.check('firma.pl', '203.0.113.7');
    return r.checks.find((c) => c.key === 'rbl')!;
  };
  afterEach(() => jest.restoreAllMocks());

  it('brak wpisów wszędzie → ok, z nazwami sprawdzonych list', async () => {
    const c = await rbl({});
    expect(c.status).toBe('ok');
    expect(c.detail).toContain('zen.spamhaus.org');
  });

  it('prawdziwy wpis → fail z nazwą listy', async () => {
    const c = await rbl({ 'bl.spamcop.net': ['127.0.0.2'] });
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('bl.spamcop.net');
  });

  it('odmowa Spamhausa (127.255.255.254) albo timeout → warn „nie udało się sprawdzić”, nie ok', async () => {
    const c = await rbl({
      'zen.spamhaus.org': ['127.255.255.254'],
      'dnsbl.sorbs.net': Object.assign(new Error('t'), { code: 'ETIMEOUT' }),
    });
    expect(c.status).toBe('warn');
    expect(c.detail).toContain('Nie udało się sprawdzić: ');
    expect(c.detail).toContain('zen.spamhaus.org');
    expect(c.detail).toContain('dnsbl.sorbs.net');
  });
});

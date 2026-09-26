import { buildMailAuthChecks, hostMatches, mergeSpf, normTxt, recommendedSpf, type MailAuthInput } from './mail-auth.js';

const IP = '203.0.113.7';
const base: MailAuthInput = { domain: 'firma.pl', sendingIp: IP, rootTxt: [], dmarcTxt: [], dkimSelector: null, zone: null };
const byKey = (i: Partial<MailAuthInput>) =>
  Object.fromEntries(buildMailAuthChecks({ ...base, ...i }).map((c) => [c.key, c]));

describe('E-15/16/17 kreator SPF/DKIM/DMARC', () => {
  it('normalizuje TXT z DA i rozpoznaje hosty strefy', () => {
    expect(normTxt('"v=spf1 a " "mx ~all"')).toBe('v=spf1 a mx ~all');
    expect(hostMatches('firma.pl.', '@', 'firma.pl')).toBe(true);
    expect(hostMatches('_dmarc.firma.pl.', '_dmarc', 'firma.pl')).toBe(true);
    expect(hostMatches('www', '@', 'firma.pl')).toBe(false);
  });

  it('SPF: brak → zalecany z IP serwera, bez nieistniejącego _spf.verris.pl', () => {
    const spf = byKey({}).spf;
    expect(spf.status).toBe('fail');
    expect(spf.suggestion?.value).toBe(`v=spf1 a mx ip4:${IP} ~all`);
    expect(recommendedSpf(null)).toBe('v=spf1 a mx ~all');
  });

  it('SPF: stary include _spf.verris.pl jest błędem i znika z sugestii', () => {
    const spf = byKey({ rootTxt: ['v=spf1 include:_spf.verris.pl ~all'] }).spf;
    expect(spf.status).toBe('fail');
    expect(spf.suggestion?.value).toBe(`v=spf1 a mx ip4:${IP} ~all`);
  });

  it('SPF: cudzy rekord dostaje nasze mechanizmy przed all, a w strefie jest edytowany', () => {
    const zone = [{ name: 'firma.pl.', type: 'TXT', value: '"v=spf1 include:_spf.google.com -all"' }];
    const spf = byKey({ rootTxt: ['v=spf1 include:_spf.google.com -all'], zone }).spf;
    expect(spf.status).toBe('warn');
    expect(spf.suggestion?.value).toBe(`v=spf1 include:_spf.google.com a mx ip4:${IP} -all`);
    expect(spf.suggestion?.replaces).toEqual({ name: 'firma.pl.', type: 'TXT', value: zone[0].value });
    expect(mergeSpf('v=spf1 mx', IP)).toBe(`v=spf1 mx a ip4:${IP} ~all`);
  });

  it('SPF: dwa rekordy to błąd; poprawny jest ok', () => {
    expect(byKey({ rootTxt: ['v=spf1 a ~all', 'v=spf1 mx ~all'] }).spf.status).toBe('fail');
    expect(byKey({ rootTxt: ['v=spf1 a mx ~all', 'google-site-verification=x'] }).spf.status).toBe('ok');
  });

  it('DKIM: brak klucza → akcja „włącz” w panelu; klucz jest → bez akcji', () => {
    expect(byKey({}).dkim).toMatchObject({ status: 'warn', action: 'enable-dkim' });
    expect(byKey({ dkimSelector: 'x' }).dkim.action).toBeUndefined();
    const zone = [{ name: 'x._domainkey.firma.pl.', type: 'TXT', value: 'v=DKIM1; p=MIIB' }];
    expect(byKey({ zone }).dkim.action).toBeUndefined();
  });

  it('DKIM: klucz tylko w strefie → do skopiowania u zewnętrznego DNS', () => {
    const zone = [{ name: 'x._domainkey.firma.pl.', type: 'TXT', value: '"v=DKIM1; k=rsa; " "p=MIIB"' }];
    const dkim = byKey({ zone }).dkim;
    expect(dkim.status).toBe('warn');
    expect(dkim.suggestion).toEqual({ host: 'x._domainkey', type: 'TXT', value: 'v=DKIM1; k=rsa; p=MIIB', inZone: true });
    expect(byKey({ dkimSelector: 'x' }).dkim.status).toBe('ok');
    expect(byKey({}).dkim.suggestion).toBeUndefined();
  });

  it('DMARC: brak, p=none, dwa rekordy', () => {
    expect(byKey({}).dmarc.suggestion?.value).toBe('v=DMARC1; p=quarantine; adkim=r; aspf=r');
    const none = byKey({ dmarcTxt: ['v=DMARC1; p=none; sp=none; rua=mailto:a@firma.pl'] }).dmarc;
    expect(none.status).toBe('warn');
    expect(none.suggestion?.value).toBe('v=DMARC1; p=quarantine; sp=none; rua=mailto:a@firma.pl');
    const two = byKey({ dmarcTxt: ['v=DMARC1; p=none;', 'v=DMARC1; p=reject'] }).dmarc;
    expect(two.status).toBe('fail');
    expect(two.suggestion?.value).toBe('v=DMARC1; p=reject');
    expect(byKey({ dmarcTxt: ['v=DMARC1; p=reject'] }).dmarc.status).toBe('ok');
  });
});

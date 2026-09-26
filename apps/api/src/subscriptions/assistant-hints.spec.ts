import { buildHints, type HintInput } from './assistant-hints.js';

const now = new Date('2026-09-23T12:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
const base: HintInput = {
  now,
  domain: 'firma.pl',
  disk: { usedMb: 100, limitMb: 1000 },
  tlsExpiresAt: inDays(60),
  domainExpiry: { name: 'firma.pl', expiresAt: inDays(200), autoRenew: false },
  backup: { lastAt: inDays(-0.5), ok: true },
  pointing: { status: 'ok', message: '' },
  mail: [
    { key: 'spf', status: 'ok', detail: '' },
    { key: 'dkim', status: 'ok', detail: '' },
    { key: 'dmarc', status: 'ok', detail: '' },
  ],
  usesPlatformDns: true,
};
const keys = (i: Partial<HintInput>) => buildHints({ ...base, ...i }).map((h) => `${h.key}:${h.severity}`);

describe('PB-17 reguły dymków asystenta', () => {
  it('zdrowa usługa = brak dymków', () => {
    expect(buildHints(base)).toEqual([]);
  });

  it('SSL: ostrzeżenie od 14 dni, krytyczne od 3 i po wygaśnięciu', () => {
    expect(keys({ tlsExpiresAt: inDays(15) })).toEqual([]);
    expect(keys({ tlsExpiresAt: inDays(10) })).toEqual(['ssl:warn']);
    expect(keys({ tlsExpiresAt: inDays(2) })).toEqual(['ssl:crit']);
    expect(buildHints({ ...base, tlsExpiresAt: inDays(-1) })[0].title).toBe('Certyfikat SSL wygasł');
  });

  it('dysk: 85% ostrzeżenie, 95% krytyczne', () => {
    expect(keys({ disk: { usedMb: 840, limitMb: 1000 } })).toEqual([]);
    expect(keys({ disk: { usedMb: 860, limitMb: 1000 } })).toEqual(['disk:warn']);
    expect(keys({ disk: { usedMb: 960, limitMb: 1000 } })).toEqual(['disk:crit']);
  });

  it('domena nie kieruje na hosting; pending nie straszy', () => {
    expect(keys({ pointing: { status: 'fail', message: 'Rekord A wskazuje gdzie indziej.' } })).toEqual(['pointing:warn']);
    expect(keys({ pointing: { status: 'pending', message: '' } })).toEqual([]);
  });

  it('kopia zapasowa: brak, nieudana albo starsza niż 2 dni', () => {
    expect(keys({ backup: { lastAt: null, ok: false } })).toEqual(['backup:warn']);
    expect(keys({ backup: { lastAt: inDays(-1), ok: false } })).toEqual(['backup:warn']);
    expect(keys({ backup: { lastAt: inDays(-3), ok: true } })).toEqual(['backup:warn']);
  });

  it('wygasająca domena bez auto-odnowienia; z auto-odnowieniem cisza', () => {
    expect(keys({ domainExpiry: { name: 'firma.pl', expiresAt: inDays(20), autoRenew: false } })).toEqual(['domain-expiry:warn']);
    expect(keys({ domainExpiry: { name: 'firma.pl', expiresAt: inDays(5), autoRenew: false } })).toEqual(['domain-expiry:crit']);
    expect(keys({ domainExpiry: { name: 'firma.pl', expiresAt: inDays(5), autoRenew: true } })).toEqual([]);
  });

  it('SPF/DMARC dostają naprawę tylko przy DNS Verris; DKIM nigdy', () => {
    const mail: HintInput['mail'] = [
      { key: 'spf', status: 'fail', detail: 'brak', suggestion: { host: '@', type: 'TXT', value: 'v=spf1 a mx ~all' } },
      { key: 'dkim', status: 'warn', detail: 'brak', suggestion: { host: 'x._domainkey', type: 'TXT', value: 'p=1', inZone: true } },
      { key: 'dmarc', status: 'fail', detail: 'brak', suggestion: { host: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=quarantine' } },
    ];
    const hints = buildHints({ ...base, mail });
    expect(hints.map((h) => [h.key, h.action?.kind])).toEqual([['spf', 'fix'], ['dmarc', 'fix'], ['dkim', 'tab']]);
    const external = buildHints({ ...base, mail, usesPlatformDns: false });
    expect(external.every((h) => h.action?.kind === 'tab')).toBe(true);
  });

  it('krytyczne idą przed ostrzeżeniami', () => {
    expect(keys({ disk: { usedMb: 990, limitMb: 1000 }, tlsExpiresAt: inDays(10) })).toEqual(['disk:crit', 'ssl:warn']);
  });
});

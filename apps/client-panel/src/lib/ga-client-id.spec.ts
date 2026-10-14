import { gaClientIdZeZgoda } from './ga-client-id';

/** 14.10 — client_id GA4 do pomiaru zakupu kartą z serwera: tylko przy zgodzie na analitykę. */
const zgoda = (analytics: boolean, v = 1) => encodeURIComponent(JSON.stringify({ v, ts: '2026-10-14T10:00:00Z', functional: true, analytics, marketing: false }));
const z = (c: Record<string, string>) => (n: string) => c[n];

describe('gaClientIdZeZgoda', () => {
  it('zgoda na analitykę + _ga → dwie ostatnie części', () => {
    expect(gaClientIdZeZgoda(z({ cookies_consent: zgoda(true), _ga: 'GA1.1.1234567890.1697000000' }))).toBe('1234567890.1697000000');
  });
  it('bez zgody na analitykę, stara wersja zgody albo brak zgody → nic', () => {
    expect(gaClientIdZeZgoda(z({ cookies_consent: zgoda(false), _ga: 'GA1.1.1.2' }))).toBeUndefined();
    expect(gaClientIdZeZgoda(z({ cookies_consent: zgoda(true, 0), _ga: 'GA1.1.1.2' }))).toBeUndefined();
    expect(gaClientIdZeZgoda(z({ _ga: 'GA1.1.1.2' }))).toBeUndefined();
  });
  it('zepsute _ga albo zepsuta zgoda → nic', () => {
    expect(gaClientIdZeZgoda(z({ cookies_consent: zgoda(true), _ga: 'GA1.1.abc.2' }))).toBeUndefined();
    expect(gaClientIdZeZgoda(z({ cookies_consent: '%7Bzepsute', _ga: 'GA1.1.1.2' }))).toBeUndefined();
  });
});

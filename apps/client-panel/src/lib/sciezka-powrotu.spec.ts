import { sciezkaPowrotu } from './sciezka-powrotu';

describe('sciezkaPowrotu — powrót po zalogowaniu bez otwartego przekierowania', () => {
  it('przepuszcza ścieżki panelu razem z parametrami (link do zgody na migrację)', () => {
    const link = '/dashboard/migrations/zgoda?serviceId=s1&id=m1&token=abc_-123';
    expect(sciezkaPowrotu(link)).toBe(link);
    expect(sciezkaPowrotu('/dashboard')).toBe('/dashboard');
    expect(sciezkaPowrotu('/dashboard?serviceId=s1')).toBe('/dashboard?serviceId=s1');
  });

  it.each([
    null,
    undefined,
    '',
    'https://zly.example/dashboard',
    '//zly.example/dashboard',
    '/\\zly.example',
    '/dashboard//zly.example',
    '/dashboardx',
    '/login',
    '/dashboard/../impersonate',
    '/dashboard/%2e%2e/impersonate',
    '/dashboard\n/x',
    `/dashboard/${'a'.repeat(3000)}`,
  ])('odrzuca %p → /dashboard', (wejscie) => {
    expect(sciezkaPowrotu(wejscie)).toBe('/dashboard');
  });
});

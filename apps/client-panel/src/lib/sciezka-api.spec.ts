import { sprawdzSciezkeApi } from '@verris/contracts';

/** Ścieżki API z danymi nie mogą przeskoczyć na inny endpoint (segmenty "." / ".."). */
describe('sprawdzSciezkeApi', () => {
  it.each(['/domains/abc', '/files?path=/home/../x', '/files/a%2Fb', '/legal/TERMS/version/1.0.0-rc.1', '/a/..b/c'])('%s → ok', (p) => {
    expect(sprawdzSciezkeApi(p)).toBe(p);
  });

  it.each(['/domains/../admin/users', '/domains/%2e%2e/admin', '/domains/%2E./x', '/a/./b', '/a/..', 'domains', '//evil.example/x', '/a\\..\\b',
    // Noc 15.10 — parser URL (fetch) usuwa \t \n \r PRZED rozwiązaniem kropek: „.\t.” staje się „..”.
    '/admin/users/.\t./.\t./admin/x/delete', '/a/.\n./b', '/a/%2e\r%2e/b', '/a/b\u0000c',
    // „#” ucina resztę ścieżki (fragment nie idzie do serwera), a metoda zostaje — POST na krótszą trasę.
    '/services/S/migrations/bundles/abc#/zgoda'])(
    '%s → odrzucone',
    (p) => {
      expect(() => sprawdzSciezkeApi(p)).toThrow('Niedozwolona ścieżka API.');
    },
  );
});

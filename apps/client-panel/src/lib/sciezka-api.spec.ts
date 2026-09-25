import { sprawdzSciezkeApi } from '@verris/contracts';

/** Ścieżki API z danymi nie mogą przeskoczyć na inny endpoint (segmenty "." / ".."). */
describe('sprawdzSciezkeApi', () => {
  it.each(['/domains/abc', '/files?path=/home/../x', '/files/a%2Fb', '/legal/TERMS/version/1.0.0-rc.1', '/a/..b/c'])('%s → ok', (p) => {
    expect(sprawdzSciezkeApi(p)).toBe(p);
  });

  it.each(['/domains/../admin/users', '/domains/%2e%2e/admin', '/domains/%2E./x', '/a/./b', '/a/..', 'domains', '//evil.example/x', '/a\\..\\b'])(
    '%s → odrzucone',
    (p) => {
      expect(() => sprawdzSciezkeApi(p)).toThrow('Niedozwolona ścieżka API.');
    },
  );
});

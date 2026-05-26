import { normalizePath } from './http-metrics.service';

describe('normalizePath', () => {
  it('replaces UUID segments', () => {
    expect(
      normalizePath('/tickets/550e8400-e29b-41d4-a716-446655440000/replies'),
    ).toBe('/tickets/:id/replies');
  });

  it('strips query string', () => {
    expect(normalizePath('/auth/login?foo=1')).toBe('/auth/login');
  });
});

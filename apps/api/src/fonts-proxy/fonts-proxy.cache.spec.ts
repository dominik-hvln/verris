import { FontsProxyService } from './fonts-proxy.service.js';

/** Audyt bezpieczeństwa 13.10: cache CSS proxy fontów nie może rosnąć bez końca od kluczy anonimowego klienta. */
describe('FontsProxyService — limit cache CSS', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('N+1 unikalnych zapytań → w pamięci najwyżej MAX_CSS_ENTRIES wpisów, najnowszy zostaje', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('@font-face{src:url(https://fonts.gstatic.com/s/a.woff2)}')));
    const svc = new FontsProxyService({ get: () => undefined } as never);
    const N = FontsProxyService.MAX_CSS_ENTRIES + 25;
    for (let i = 0; i < N; i++) await svc.css(`family=Inter${i}`);
    expect(svc.cssCacheStats().entries).toBe(FontsProxyService.MAX_CSS_ENTRIES);
    // Najnowszy jest w cache — drugie wywołanie nie idzie do Google.
    const przed = vi.mocked(fetch).mock.calls.length;
    await svc.css(`family=Inter${N - 1}`);
    expect(vi.mocked(fetch).mock.calls.length).toBe(przed);
  });

  it('limit bajtów: duże odpowiedzi nie przekraczają MAX_CSS_BYTES', async () => {
    const duzy = 'x'.repeat(Math.ceil(FontsProxyService.MAX_CSS_BYTES / 3));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(duzy)));
    const svc = new FontsProxyService({ get: () => undefined } as never);
    for (let i = 0; i < 10; i++) await svc.css(`family=Big${i}`);
    expect(svc.cssCacheStats().bytes).toBeLessThanOrEqual(FontsProxyService.MAX_CSS_BYTES);
  });

  it('zbyt długie zapytanie → 400 bez pobierania', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const svc = new FontsProxyService({ get: () => undefined } as never);
    await expect(svc.css('family=' + 'A'.repeat(1100))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

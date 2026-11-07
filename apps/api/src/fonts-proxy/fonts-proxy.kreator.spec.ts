import { FontsProxyService } from './fonts-proxy.service.js';

/** Paczka 119: pliki fontów stron z kreatora – tylko odmiany z KATALOG_FONTOW, właściwy zakres znaków. */
describe('FontsProxyService – fonty kreatora', () => {
  afterEach(() => vi.unstubAllGlobals());

  const css = [
    '/* latin-ext */\n@font-face {\n  font-family: \'Inter\';\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/inter/ext.woff2) format(\'woff2\');\n}',
    '/* latin */\n@font-face {\n  font-family: \'Inter\';\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/inter/lat.woff2) format(\'woff2\');\n}',
  ].join('\n');

  it('nazwa z renderera → plik z właściwego bloku zakresu (latin-ext ≠ latin)', async () => {
    const fetchMock = vi.fn(async (u: string) =>
      u.startsWith('https://fonts.googleapis.com') ? new Response(css) : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'font/woff2' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const svc = new FontsProxyService({ get: () => 'https://api.example.test' } as never);
    await svc.plikKreatora('inter-400-latin-ext.woff2');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('https://fonts.gstatic.com/s/inter/ext.woff2');
    await svc.plikKreatora('inter-400-latin.woff2');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('https://fonts.gstatic.com/s/inter/lat.woff2');
    expect(String(fetchMock.mock.calls[0][0])).toContain('family=Inter:wght@400');
  });

  it('rodzina, waga lub kursywa spoza katalogu, ścieżki i inne rozszerzenia → 400 bez pobierania', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const svc = new FontsProxyService({ get: () => undefined } as never);
    for (const zla of ['comic-sans-400-latin.woff2', 'inter-950-latin.woff2', '../inter-400-latin.woff2', 'inter-400-latin.ttf', 'inter-400-cyrillic.woff2']) {
      await expect(svc.plikKreatora(zla)).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

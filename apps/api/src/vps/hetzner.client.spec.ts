import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common';
import { HetznerClient } from './hetzner.client.js';

/**
 * Q-07/Q-08 — wywołania API chmury wg https://docs.hetzner.cloud/reference/cloud (cloud.spec.json):
 * ścieżki, metody i pola ciała. Plus white label: klient nie widzi nazwy dostawcy w błędzie.
 */
function klient(odpowiedz: { status?: number; body?: unknown }) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const status = odpowiedz.status ?? 200;
    return { ok: status < 400, status, text: async () => (odpowiedz.body === undefined ? '' : JSON.stringify(odpowiedz.body)) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const c = new HetznerClient({ get: () => 'tok-123' } as never);
  const wywolanie = () => {
    const [url, init] = fetchMock.mock.calls[0];
    return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, init };
  };
  return { c, wywolanie };
}

const akcja = { id: 77, command: 'x', status: 'running', progress: 0, resources: [], error: null };

describe('HetznerClient — snapshoty, rebuild, konsola', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('createSnapshot: POST /servers/{id}/actions/create_image z type=snapshot, opisem i etykietą', async () => {
    const { c, wywolanie } = klient({ status: 201, body: { image: { id: 9, status: 'creating', image_size: null }, action: akcja } });
    const r = await c.createSnapshot('42', { description: 'przed aktualizacją', labels: { 'verris-vps': 'v1' } });
    const w = wywolanie();
    expect(w.url).toBe('https://api.hetzner.cloud/v1/servers/42/actions/create_image');
    expect(w.method).toBe('POST');
    expect(w.body).toEqual({ type: 'snapshot', description: 'przed aktualizacją', labels: { 'verris-vps': 'v1' } });
    expect((w.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect(r).toEqual({ image: expect.objectContaining({ id: 9, status: 'creating' }), actionId: 77 });
  });

  it('listSnapshots: GET /images?type=snapshot&label_selector=…', async () => {
    const { c, wywolanie } = klient({ body: { images: [{ id: 9 }] } });
    expect(await c.listSnapshots('verris-vps=v1')).toEqual([{ id: 9 }]);
    const u = new URL(wywolanie().url);
    expect(u.pathname).toBe('/v1/images');
    expect(u.searchParams.get('type')).toBe('snapshot');
    expect(u.searchParams.get('label_selector')).toBe('verris-vps=v1');
  });

  it('listSystemImages: GET /images?type=system&status=available&architecture=arm', async () => {
    const { c, wywolanie } = klient({ body: { images: [] } });
    await c.listSystemImages('arm');
    const u = new URL(wywolanie().url);
    expect([u.searchParams.get('type'), u.searchParams.get('status'), u.searchParams.get('architecture')]).toEqual(['system', 'available', 'arm']);
  });

  it('deleteImage: DELETE /images/{id} (204 bez treści)', async () => {
    const { c, wywolanie } = klient({ status: 204 });
    await c.deleteImage('9');
    expect(wywolanie()).toMatchObject({ url: 'https://api.hetzner.cloud/v1/images/9', method: 'DELETE' });
  });

  it('rebuild: POST /servers/{id}/actions/rebuild z image; zwraca root_password i id akcji', async () => {
    const { c, wywolanie } = klient({ status: 201, body: { root_password: 'nowe', action: akcja } });
    expect(await c.rebuild('42', 'debian-12')).toEqual({ rootPassword: 'nowe', actionId: 77 });
    expect(wywolanie()).toMatchObject({ url: 'https://api.hetzner.cloud/v1/servers/42/actions/rebuild', method: 'POST', body: { image: 'debian-12' } });
  });

  it('getAction: GET /actions/{id}', async () => {
    const { c, wywolanie } = klient({ body: { action: { ...akcja, status: 'success', progress: 100 } } });
    expect((await c.getAction('77')).status).toBe('success');
    expect(wywolanie().url).toBe('https://api.hetzner.cloud/v1/actions/77');
  });

  it('requestConsole: POST /servers/{id}/actions/request_console → wss_url + password', async () => {
    const { c, wywolanie } = klient({ status: 201, body: { wss_url: 'wss://console.example/x', password: 'jednorazowe', action: akcja } });
    expect(await c.requestConsole('42')).toEqual({ wssUrl: 'wss://console.example/x', password: 'jednorazowe' });
    expect(wywolanie()).toMatchObject({ url: 'https://api.hetzner.cloud/v1/servers/42/actions/request_console', method: 'POST' });
  });

  it('błąd dostawcy → neutralny komunikat po polsku, bez nazwy dostawcy', async () => {
    const { c } = klient({ status: 422, body: { error: { code: 'service_error', message: 'Hetzner internal problem' } } });
    const e = (await c.rebuild('42', 'x').catch((err: Error) => err)) as Error;
    expect(e).toBeInstanceOf(BadGatewayException);
    expect(e.message).not.toMatch(/hetzner/i);
    expect(e.message).toContain('nie powiodła się');
  });

  it('locked (trwa inna akcja) → 409 z komunikatem dla klienta; 404 → NotFound', async () => {
    const a = klient({ status: 423, body: { error: { code: 'locked', message: 'server is locked' } } });
    await expect(a.c.createSnapshot('42', { description: 'x', labels: {} })).rejects.toBeInstanceOf(ConflictException);
    const b = klient({ status: 404, body: { error: { code: 'not_found', message: 'image not found' } } });
    await expect(b.c.deleteImage('9')).rejects.toBeInstanceOf(NotFoundException);
  });
});

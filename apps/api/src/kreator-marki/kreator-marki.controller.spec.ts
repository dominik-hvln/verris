import { HttpException } from '@nestjs/common';
import { inferCustomerRoutePermissions } from '../common/guards/customer-permissions.guard.js';
import { KreatorMarkiController, KreatorMarkiPlikPublicznyController, naglowkiPlikuMarki } from './kreator-marki.controller.js';

/**
 * Paczka 131 – kontroler Kreatora marki: tożsamość wyłącznie z tokenu (id konta do serwisu, osoba jako aktor), nagłówki
 * plików (nosniff, CSP `default-src 'none'` dla SVG, Content-Disposition), limity żądań na trasach AI i plików,
 * uprawnienia subkont (zakupy = SERVICES_MANAGE + BILLING_MANAGE). Kody 402/409 przechodzą z serwisu bez zmian.
 */

function odpowiedz() {
  const naglowki: Record<string, string> = {};
  const res = {
    naglowki,
    setHeader: vi.fn((k: string, v: string) => void (naglowki[k] = v)),
    status: vi.fn(() => res),
    send: vi.fn(() => res),
    end: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res;
}

const U = { userId: 'wlasciciel', principalUserId: 'osoba' };

describe('KreatorMarkiController', () => {
  it('serwis dostaje id konta z tokenu i osobę jako aktora – nie dane z ciała żądania', async () => {
    const svc = { utworz: vi.fn(async () => ({})), pobierz: vi.fn(async () => ({})), zakup: vi.fn(async () => ({})) };
    const c = new KreatorMarkiController(svc as never);
    await c.utworz(U, { zrodlo: 'nowa', userId: 'ktos-inny' } as never);
    expect(svc.utworz).toHaveBeenCalledWith({ userId: 'wlasciciel', actorUserId: 'osoba' }, { zrodlo: 'nowa', userId: 'ktos-inny' });
    await c.pobierz({ userId: 'wlasciciel' }, 'm1');
    expect(svc.pobierz).toHaveBeenCalledWith('wlasciciel', 'm1');
    await c.pakiet({ userId: 'w2' }, { metoda: 'portfel' });
    expect(svc.zakup).toHaveBeenCalledWith({ userId: 'w2', actorUserId: 'w2' }, 'PAKIET', { metoda: 'portfel' });
  });

  it('plik do pobrania: typ, nosniff, CSP, attachment z bezpieczną nazwą; błędy serwisu (402/409) przechodzą bez zmian', async () => {
    const svc = {
      plik: vi.fn(async () => ({ dane: Buffer.from('<svg/>'), typ: 'image/svg+xml', nazwa: 'logo-poziome-kolor.svg' })),
      eksport: vi.fn(async () => {
        throw new HttpException({ message: 'Pakiet', kod: 'PAKIET_WYMAGANY' }, 402);
      }),
    };
    const c = new KreatorMarkiController(svc as never);
    const res = odpowiedz();
    await c.plik(U, 'm1', 'logo-poziome-kolor.svg', res as never);
    expect(svc.plik).toHaveBeenCalledWith({ userId: 'wlasciciel', actorUserId: 'osoba' }, 'm1', 'logo-poziome-kolor.svg');
    expect(res.naglowki).toMatchObject({
      'Content-Type': 'image/svg+xml',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="logo-poziome-kolor.svg"; filename*=UTF-8''logo-poziome-kolor.svg`,
    });
    expect(res.naglowki['Content-Security-Policy']).toMatch(/^default-src 'none';.*sandbox/);
    await expect(c.eksport(U, 'm1', odpowiedz() as never)).rejects.toMatchObject({ status: 402 });
  });

  it('nazwa pliku z polskimi znakami: ASCII w filename, UTF-8 w filename*', () => {
    const res = odpowiedz();
    naglowkiPlikuMarki(res as never, 'application/zip', 'łódka-marka.zip', true);
    expect(res.naglowki['Content-Disposition']).toBe(`attachment; filename="__dka-marka.zip"; filename*=UTF-8''%C5%82%C3%B3dka-marka.zip`);
  });

  it('materiał spoza wzorca nazwy – 404 bez wołania serwisu; logo.svg inline z CSP', async () => {
    const svc = { material: vi.fn(), logoSvg: vi.fn(async () => '<svg/>') };
    const c = new KreatorMarkiController(svc as never);
    const res = odpowiedz();
    await c.material(U, 'm1', '../etc/passwd', res as never);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(svc.material).not.toHaveBeenCalled();
    const r2 = odpowiedz();
    await c.logo(U, 'm1', { uklad: 'poziomy' }, r2 as never);
    expect(r2.naglowki['Content-Type']).toBe('image/svg+xml; charset=utf-8');
    expect(r2.naglowki['Content-Disposition']).toBeUndefined();
    expect(r2.naglowki['Content-Security-Policy']).toContain("default-src 'none'");
  });

  it('limity żądań na trasach AI, wgrania, plików i zakupów', () => {
    const meta = (m: keyof KreatorMarkiController) => Reflect.getMetadataKeys(KreatorMarkiController.prototype[m] as object).map((k) => Reflect.getMetadata(k, KreatorMarkiController.prototype[m] as object));
    for (const m of ['seria', 'odswiezenie', 'ai', 'kvAi', 'wgraj', 'plik', 'eksport', 'pakiet', 'drugaMarka', 'napis'] as const) {
      expect(JSON.stringify(meta(m)), m).toMatch(/"scope":"kreator-marki:/);
    }
  });

  it('plik publiczny: PNG, nosniff, CORP cross-origin (programy pocztowe), bez ciasteczek', async () => {
    const svc = { plikPubliczny: vi.fn(async () => Buffer.from('png')) };
    const c = new KreatorMarkiPlikPublicznyController(svc as never);
    const res = odpowiedz();
    await c.plik('t', 'logo-stopka.png', res as never);
    expect(res.naglowki).toMatchObject({ 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  });
});

describe('uprawnienia subkont – Kreator marki', () => {
  it('podgląd SERVICES_READ, zmiany FILES_MANAGE, zakupy SERVICES_MANAGE + BILLING_MANAGE', () => {
    expect(inferCustomerRoutePermissions('GET', '/kreator-marki/marki/:id/pliki/:plik')).toEqual(['SERVICES_READ']);
    expect(inferCustomerRoutePermissions('POST', '/kreator-marki/marki/:id/serie')).toEqual(['FILES_MANAGE']);
    expect(inferCustomerRoutePermissions('DELETE', '/kreator-marki/marki/:id')).toEqual(['FILES_MANAGE']);
    expect(inferCustomerRoutePermissions('POST', '/kreator-marki/pakiet')).toEqual(['SERVICES_MANAGE', 'BILLING_MANAGE']);
    expect(inferCustomerRoutePermissions('POST', '/kreator-marki/druga-marka')).toEqual(['SERVICES_MANAGE', 'BILLING_MANAGE']);
  });
});

import { PublicBadgesController } from './public-badges.controller';
import { renderLoader } from './badge-render';

const seal = {
  domain: 'piekarnia.pl',
  sslUntil: new Date('2026-12-14T00:00:00Z'),
  uptime30: 99.97,
  days30: Array.from({ length: 30 }, (_, i) => ({ day: i, pct: 100, downS: 0 })),
  lastCheckedAt: new Date(),
  verifyUrl: 'https://api.verris.pl/public/badges/weryfikacja/x',
};

function setup(site: object | null) {
  const badges = {
    site: jest.fn().mockResolvedValue(site),
    clientUrl: () => 'https://panel.verris.pl',
    apiBase: () => 'https://api.verris.pl',
  };
  const eco = { recordImpression: jest.fn() };
  const ctrl = new PublicBadgesController(badges as never, eco as never);
  const headers: Record<string, string> = { 'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-site' };
  const res = {
    setHeader: (k: string, v: string) => (headers[k] = v),
    removeHeader: (k: string) => delete headers[k],
  };
  return { ctrl, res, headers, eco };
}

const req = (referer?: string) => ({ headers: { referer }, ip: '1.2.3.4' }) as never;

describe('Badge — pieczęć na stronie klienta', () => {
  it('na domenie usługi: pełna pieczęć, ramkę wolno osadzić, skrypt tylko z nonce, wyświetlenie liczone', async () => {
    const { ctrl, res, headers, eco } = setup({ seal, domain: 'piekarnia.pl', ecoToken: 'tok' });
    const html = await ctrl.seal('id', 'ciemny', req('https://www.piekarnia.pl/'), res as never);
    expect(html).toContain('Strona zweryfikowana');
    expect(headers['X-Frame-Options']).toBeUndefined();
    expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    const nonce = /script-src 'nonce-([^']+)'/.exec(headers['Content-Security-Policy'])?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(eco.recordImpression).toHaveBeenCalledTimes(1);
  });

  it('na obcej stronie albo bez Referer: pusta ramka i żadnych punktów', async () => {
    for (const ref of ['https://oszust.pl/', undefined]) {
      const { ctrl, res, eco } = setup({ seal, domain: 'piekarnia.pl', ecoToken: 'tok' });
      const html = await ctrl.seal('id', 'ciemny', req(ref), res as never);
      expect(html).not.toContain('Strona zweryfikowana');
      expect(eco.recordImpression).not.toHaveBeenCalled();
    }
  });

  it('warunki niespełnione (seal = null): pusta ramka nawet na własnej domenie', async () => {
    const { ctrl, res } = setup({ seal: null, domain: 'piekarnia.pl', ecoToken: 'tok' });
    expect(await ctrl.seal('id', 'ciemny', req('https://piekarnia.pl/'), res as never)).not.toContain('Strona zweryfikowana');
  });

  it('dane z bazy są escapowane w HTML', async () => {
    const evil = { ...seal, domain: '"><img src=x onerror=alert(1)>' };
    const { ctrl, res } = setup({ seal: evil, domain: evil.domain, ecoToken: null });
    const html = await ctrl.seal('id', 'ciemny', req('https://panel.verris.pl/x'), res as never);
    expect(html).not.toContain('<img src=x');
  });

  it('loader przyjmuje rozmiar tylko od własnej ramki i waliduje id', () => {
    const js = renderLoader('https://api.verris.pl');
    expect(js).toContain('e.source!==f.contentWindow');
    expect(js).toContain("allow-scripts allow-popups allow-popups-to-escape-sandbox");
    expect(js).not.toContain('allow-same-origin');
    expect(js).toContain("referrerpolicy','origin'");
  });
});

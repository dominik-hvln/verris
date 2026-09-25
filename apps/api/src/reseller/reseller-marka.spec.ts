import { blokPartnera, typLogo, wstawMarke, ZNACZNIK_PARTNERA_DO, ZNACZNIK_PARTNERA_OD } from './reseller-marka';
import { renderEmailShell } from '../mail/templates/_layouts/email-shell';

describe('O-09 — marka resellera', () => {
  it('logo rozpoznaje po sygnaturze pliku, SVG i HTML odrzuca', () => {
    expect(typLogo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(typLogo(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(typLogo(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(typLogo(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(typLogo(Buffer.from('<html>'))).toBeNull();
  });

  it('mail z email-shell dostaje blok partnera w nagłówku i dopisek w tekście', () => {
    const { html, text } = renderEmailShell({ title: 'T', bodyMarkdown: 'Treść', recipientEmail: 'a@b.pl', panelUrl: 'https://panel.verris.pl' });
    expect(html).toContain(ZNACZNIK_PARTNERA_OD);
    const w = wstawMarke(html, text, { nazwa: 'Studio <Nowak>', logoUrl: null });
    expect(w.html).toContain('Studio &lt;Nowak&gt;');
    expect(w.html).toContain('na infrastrukturze Verris');
    expect(w.html).not.toContain('Skaluj świadomie</span>\n                <!--/verris');
    expect(w.text).toMatch(/— Studio <Nowak>, na infrastrukturze Verris$/);
  });

  it('mail bez znaczników zostaje bez zmian', () => {
    expect(wstawMarke('<p>x</p>', 'x', { nazwa: 'A', logoUrl: null })).toEqual({ html: '<p>x</p>', text: 'x' });
    expect(blokPartnera({ nazwa: 'A', logoUrl: 'https://api/x"y' })).toContain('x&quot;y');
    expect(ZNACZNIK_PARTNERA_DO).toBe('<!--/verris-partner-->');
  });
});

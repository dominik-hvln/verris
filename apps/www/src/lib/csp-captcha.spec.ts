import { readFileSync } from 'fs';
import { join } from 'path';
import { captchaWww, cspWww } from './csp';

/** Decyzja 14.10 — captcha w formularzach verris.pl, ten sam dostawca co rejestracja w panelu. */
describe('verris.pl — captcha w CSP i formularzach', () => {
  it('bez klucza strony: CSP bez źródeł dostawcy', () => {
    expect(captchaWww('', 'turnstile')).toBeNull();
    expect(cspWww('n', false, null)).not.toContain('challenges.cloudflare.com');
  });

  it('z kluczem: źródła wybranego dostawcy w script-src i frame-src (reCAPTCHA domyślnie)', () => {
    expect(captchaWww('klucz', 'turnstile')).toBe('turnstile');
    expect(captchaWww('klucz', 'cos-innego')).toBe('recaptcha');
    const csp = cspWww('n', false, 'turnstile');
    const dyr = (nazwa: string) => csp.split('; ').find((d) => d.startsWith(`${nazwa} `)) ?? '';
    expect(dyr('script-src')).toContain('https://challenges.cloudflare.com');
    expect(dyr('frame-src')).toContain('https://challenges.cloudflare.com');
    expect(dyr('script-src')).toContain("'nonce-n'");
  });

  it('oba formularze leadów renderują captchę i wysyłają jej token', () => {
    for (const plik of ['ContactForm.tsx', 'MigrationLeadForm.tsx']) {
      const kod = readFileSync(join(__dirname, '..', 'app', '(frontend)', 'components', plik), 'utf8');
      expect(kod).toContain('<Captcha action="lead" />');
      expect(kod).toContain('captchaToken: captchaTokenFromForm(fd)');
    }
  });
});

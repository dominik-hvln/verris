import { readFileSync } from 'fs';
import { join } from 'path';
import { genPassword } from './PoleHasla';

describe('PoleHasla', () => {
  it('generator: 18 znaków bez mylących (0, O, 1, l, I)', () => {
    const h = genPassword();
    expect(h).toHaveLength(18);
    expect(h).not.toMatch(/[0O1lI]/);
  });

  it('pola haseł w zakładkach hostingu idą przez PoleHasla (retest 29.09: hasło skrzynki było widoczne)', () => {
    for (const f of ['MailTab.tsx', 'FtpTab.tsx', 'DatabasesTab.tsx', 'DbUsers.tsx']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src).not.toMatch(/<input\s+value=\{(password|pwValue)\}/);
      expect(src).toContain('<PoleHasla');
    }
  });
});

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { accountCreatedByOperatorTemplate, emailVerifyTemplate, passwordResetHeldTemplate, welcomeTemplate } from './auth-notifications.js';
import {
  emailChangeAlertTemplate,
  newDeviceLoginTemplate,
  passkeyAddedTemplate,
  passkeyRemovedTemplate,
  passwordChangedTemplate,
  twoFactorDisabledTemplate,
} from './security-notifications.js';
import { promoCodeRedeemedTemplate } from './promo-notifications.js';
import { orderReceivedTemplate } from './order-notifications.js';
import { godzin, kwotaPl } from './_layouts/odmiana.js';

/**
 * Paczka 109 — teksty maili do klienta:
 * - A2-13: maile bezpieczeństwa prowadziły na 404 (`/settings/security`), podawały nieistniejący adres support@,
 *   obiecywały przycisk, którego nie było, i mówiły po angielsku „(security-critical)”;
 * - P1-08: „Link jest ważny 24 godzin”; P1-09: „Jeśli to nie Ty zakładałeś konto” do kobiety;
 * - P4-13: „PROMO_CREDIT”, „150.00 zł”, „subkonta IAM”, „provisioning”, „support”;
 * - A2-08: potwierdzenie zamówienia z danymi sprzedawcy, odnowieniem i odstąpieniem, nie same linki.
 * Na starym kodzie każdy z poniższych testów pada.
 */
const tresc = (m: { text?: string; html?: string; subject: string }) => `${m.subject}\n${m.text ?? ""}\n${m.html ?? ""}`;
const panelUrl = 'https://panel.verris.pl';
const kiedy = new Date('2026-11-03T10:00:00Z');

describe('Maile bezpieczeństwa (A2-13)', () => {
  const maile = [
    newDeviceLoginTemplate({ to: 'a@b.pl', firstName: 'Anna', loginAt: kiedy, deviceLabel: 'Chrome', ipAddress: '1.2.3.4', countryCode: null, panelUrl }),
    twoFactorDisabledTemplate({ to: 'a@b.pl', firstName: 'Anna', disabledAt: kiedy, panelUrl } as never),
    passwordChangedTemplate({ to: 'a@b.pl', firstName: 'Anna', changedAt: kiedy, deviceLabel: null, ipAddress: null, panelUrl }),
    passkeyAddedTemplate({ to: 'a@b.pl', firstName: 'Anna', at: kiedy, deviceName: 'Laptop', panelUrl }),
    passkeyRemovedTemplate({ to: 'a@b.pl', firstName: 'Anna', at: kiedy, deviceName: 'Laptop', panelUrl }),
    emailChangeAlertTemplate({ to: 'a@b.pl', firstName: 'Anna', newEmail: 'x@y.pl', at: kiedy, panelUrl }),
    passwordResetHeldTemplate({ to: 'a@b.pl', firstName: 'Anna', hours: 24, panelUrl }),
  ];

  it('link prowadzi do istniejącej strony ustawień, kontakt to kontakt@verris.pl, bez „security-critical”', () => {
    for (const m of maile) {
      const t = tresc(m);
      expect(t).not.toContain('/settings/security');
      expect(t).not.toContain('support@verris.pl');
      expect(t).not.toContain('security-critical');
    }
    expect(tresc(maile[0])).toContain(`${panelUrl}/dashboard/settings?tab=security`);
    expect(tresc(maile[0])).toContain('kontakt@verris.pl');
  });

  it('opis zgodny z panelem: przycisk „Wyloguj wszystkie inne urządzenia”, alert o nowym urządzeniu da się wyłączyć', () => {
    const t = tresc(maile[0]);
    expect(t).toContain('Wyloguj wszystkie inne urządzenia');
    expect(t).not.toContain('w panelu jest taki przycisk');
    expect(t).not.toContain('nie da się go wyłączyć');
    expect(t).toContain('Ustawieniach → Powiadomienia');
  });
});

describe('Liczebniki i forma neutralna (P1-08, P1-09)', () => {
  it('„24 godziny”, „5 godzin”, „1 godzinę”', () => {
    expect(godzin(24)).toBe('24 godziny');
    expect(godzin(5)).toBe('5 godzin');
    expect(godzin(1)).toBe('1 godzinę');
    expect(godzin(22)).toBe('22 godziny');
    expect(godzin(12)).toBe('12 godzin');
    expect(emailVerifyTemplate({ to: 'a@b.pl', firstName: 'Anna', verifyUrl: 'https://x', expiresHours: 24, panelUrl }).text).toContain('24 godziny');
    expect(accountCreatedByOperatorTemplate({ to: 'a@b.pl', firstName: null, setPasswordUrl: 'https://x', expiresHours: 72, panelUrl }).text).toContain('72 godziny');
  });

  it('żaden szablon maila do klienta nie zwraca się w formie męskiej („zakładałeś”, „prosiłeś”, „byłeś”)', () => {
    const trafienia: string[] = [];
    const sprawdz = (p: string) => {
      const kod = readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
      for (const m of kod.matchAll(/[\p{L}]+(?:łeś|łbyś)(?![\p{L}])/gu)) trafienia.push(`${p}: ${m[0]}`);
    };
    const przejdz = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) przejdz(p);
        else if (n.endsWith('.ts') && !n.endsWith('.spec.ts')) sprawdz(p);
      }
    };
    przejdz(__dirname);
    sprawdz(join(__dirname, '../../leads/leads.templates.ts'));
    expect(trafienia).toEqual([]);
  });
});

describe('Bez żargonu i kodów wewnętrznych (P4-13)', () => {
  it('powitanie: bez „IAM”, „provisioning”, „support”', () => {
    const t = tresc(welcomeTemplate({ to: 'a@b.pl', firstName: 'Zbigniew', panelUrl }));
    expect(t).not.toMatch(/\bIAM\b|provisioning|\bsupport(?!ed)/i);
  });

  it('kod promocyjny: kwota „150,00 zł”, bez „PROMO_CREDIT”', () => {
    const t = tresc(
      promoCodeRedeemedTemplate({
        to: 'a@b.pl',
        firstName: null,
        code: 'BETA-ABC',
        kind: 'FLAT',
        amountPln: '150.00',
        description: null,
        walletBalancePln: '1250.5',
        panelUrl,
      }),
    );
    expect(t).not.toContain('PROMO_CREDIT');
    expect(t).not.toContain('150.00');
    expect(t).toContain('150,00 zł');
    expect(t).toContain(`${kwotaPl('1250.5')} K`);
    expect(t).toContain('nie ma za nie faktury');
  });
});

describe('Potwierdzenie zamówienia (A2-08)', () => {
  it('ma dane sprzedawcy bez telefonu, cenę brutto, automatyczne odnowienie, reklamacje i odstąpienie', () => {
    const m = orderReceivedTemplate({
      to: 'a@b.pl',
      firstName: 'Marek',
      planName: 'Hosting',
      serviceTag: 'h-1',
      amountLabel: '449.00 PLN',
      interval: 'YEAR',
      domain: 'sklep.pl',
      paymentLabel: 'Portfel Verris',
      panelUrl,
    });
    const t = tresc(m);
    expect(t).toContain('HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra');
    expect(t).toContain('NIP 9292069367');
    expect(t).not.toMatch(/\+48|511 589 465/);
    expect(t).toContain('449,00 zł brutto za rok');
    expect(t).toContain('odnawia się automatycznie co rok');
    expect(t).toContain('Reklamacje');
    expect(t).toContain('w ciągu 14 dni od jej zawarcia');
    expect(t).not.toContain('zażądałeś');
  });
});

import { emailChangeAlertTemplate } from './security-notifications.js';

/**
 * Audyt Fali 3 — alert o zmianie e-maila przez obsługę: jedna droga reakcji, która dochodzi do zespołu bezpieczeństwa
 * (odpowiedź na alert). Wcześniej kazał też „napisać z tego adresu na support@”, a poczta zgłoszeń nie rozpoznawała
 * starego adresu jako klienta (mail trafiał do „obcych”, bez zgłoszenia).
 */
describe('alert o zmianie e-maila przez obsługę', () => {
  it('każe odpisać na alert, bez kierowania na support@ ze starego adresu', () => {
    const m = emailChangeAlertTemplate({ to: 'stary@klient.pl', firstName: 'Anna', newEmail: 'nowy@klient.pl', at: new Date('2026-10-11T10:00:00Z'), panelUrl: 'https://panel.test', przezObsluge: true });
    expect(m.text).toContain('Odpisz natychmiast na tę wiadomość');
    expect(m.text).not.toContain('support@');
    expect(m.text).not.toMatch(/z tego adresu/);
  });
});

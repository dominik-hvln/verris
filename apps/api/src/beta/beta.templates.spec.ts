import { zaproszenieDoTestowTemplate } from './beta.templates.js';

/** PB-26 / PB-40 — mail z zaproszeniem mówi testerowi, jak zgłaszać uwagi (przycisk „Zgłoś uwagę” w panelu). */
describe('zaproszenieDoTestowTemplate', () => {
  const m = zaproszenieDoTestowTemplate({
    to: 'tester@example.pl',
    name: 'Ola',
    code: 'BETA-ABC234',
    credit: 150,
    validTo: new Date('2026-10-29T12:00:00Z'),
    panelUrl: 'https://panel.example.pl',
  });

  it('kod, kwota, ważność i link do rejestracji', () => {
    expect(m.subject).toBe('Zaproszenie do testów Verris');
    expect(m.text).toContain('BETA-ABC234');
    expect(m.text).toContain('150 K do portfela');
    expect(m.text).toContain('29 października 2026');
    expect(m.html).toContain('https://panel.example.pl/register');
  });

  it('instrukcja zgłaszania: przycisk „Zgłoś uwagę”, wskazanie miejsca, zrzut z podglądem; temat Beta w Centrum pomocy', () => {
    expect(m.text).toContain('„Zgłoś uwagę”');
    expect(m.text).toContain('„Wskaż miejsce na stronie”');
    expect(m.text).toContain('zrzut ekranu z zaznaczeniem');
    expect(m.text).toContain('Centrum pomocy → Nowe zgłoszenie → temat „Testy (beta)”');
  });
});

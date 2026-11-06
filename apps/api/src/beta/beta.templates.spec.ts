import { tylkoPocztaWZakresie, zaproszenieDoTestowTemplate } from './beta.templates.js';

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

  it('link do listy scenariuszy w panelu i uczciwa informacja o usłudze po testach', () => {
    expect(m.text).toContain('https://panel.example.pl/dashboard/beta');
    expect(m.text).toContain('Usługa zostaje po testach');
    expect(m.text).toContain('Gdyby coś miało się zmienić, napiszemy z wyprzedzeniem.');
  });

  it('P1-13: „Załóż konto” zaraz pod kodem (przed listą scenariuszy), link do Testów pod nazwą, nadawca po polsku', () => {
    const html = m.html ?? '';
    const kod = html.indexOf('BETA-ABC234');
    const pierwszyLink = html.indexOf('https://panel.example.pl/register');
    expect(kod).toBeGreaterThan(-1);
    expect(pierwszyLink).toBeGreaterThan(kod);
    expect(pierwszyLink).toBeLessThan(html.indexOf('Co sprawdzić'));
    expect(m.html).toContain('>Testy (beta)</a>');
    expect(m.html).not.toContain('(https://panel.example.pl/dashboard/beta)');
    expect(m.fromName).toBe('Zespół Verris');
    expect(m.text).toContain('nie ma za nie faktury');
  });

  it('P4-12: wariant „tylko poczta” – zamówienie poczty bez hostingu, migracji i WordPressa', () => {
    const p = zaproszenieDoTestowTemplate({
      to: 'zbigniew@example.pl',
      code: 'BETA-POCZTA',
      credit: 150,
      validTo: new Date('2026-12-20T12:00:00Z'),
      panelUrl: 'https://panel.example.pl',
      tylkoPoczta: true,
    });
    expect(p.text).toContain('Nowa usługa → Poczta e-mail');
    expect(p.text).toContain('hostingu nie musisz kupować');
    expect(p.text).not.toMatch(/Zamów hosting|WordPress|kreatorem migracji|na trzy miesiące/);
    expect(m.text).toContain('Zamów hosting');
    expect(tylkoPocztaWZakresie(['POCZTA'])).toBe(true);
    expect(tylkoPocztaWZakresie(['POCZTA', 'WORDPRESS'])).toBe(false);
    expect(tylkoPocztaWZakresie([])).toBe(false);
    expect(tylkoPocztaWZakresie(null)).toBe(false);
  });
});

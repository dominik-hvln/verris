import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BetaZgloszeniaPublicController } from './beta-zgloszenia.controller.js';
import { ZgloszenieBetaDto } from './dto/zgloszenie-beta.dto.js';
import { potwierdzenieZgloszeniaBetaTemplate, stanZaproszeniaBetaTemplate, zmianaZgloszeniaBetaTemplate } from './beta.templates.js';

/**
 * Paczka 109 — linki z maili bety (A1-06, P5-09, A1-05) i pole imienia (A1-04).
 * Na starym kodzie: GET od razu potwierdzał (skaner poczty potwierdzał za człowieka), drugie kliknięcie dawało
 * „Link nieaktualny”, strona nie miała własnego CSP, a imię „Twoje konto wygasa… verris-platnosci.example” przechodziło.
 */
function kontroler(stan: string, wynik = 'POTWIERDZONE') {
  const zgl = { stanLinku: vi.fn(async () => stan), potwierdz: vi.fn(async () => ({ stan: wynik })) };
  return { c: new BetaZgloszeniaPublicController(zgl as never, { verify: vi.fn() } as never), zgl };
}

describe('Link potwierdzenia bety — GET pokazuje przycisk, POST potwierdza', () => {
  it('GET z ważnym tokenem: strona z formularzem POST, bez wykonania akcji', async () => {
    const { c, zgl } = kontroler('DO_POTWIERDZENIA');
    const html = await c.potwierdzStrona('tok-"<x>');
    expect(zgl.potwierdz).not.toHaveBeenCalled();
    expect(html).toContain('<form method="post" action="/public/beta/zgloszenia/potwierdz">');
    expect(html).toContain('value="tok-&quot;&lt;x&gt;"');
    expect(html).toContain('Potwierdzam zgłoszenie');
  });

  it('GET z linkiem zmiany danych: przycisk „Potwierdzam zmianę”', async () => {
    const { c } = kontroler('ZMIANA_DO_POTWIERDZENIA');
    expect(await c.potwierdzStrona('t')).toContain('Potwierdzam zmianę');
  });

  it('drugie otwarcie linku: zielone „już potwierdzone”, nie „nieaktualny”', async () => {
    const { c } = kontroler('JUZ_POTWIERDZONE');
    const html = await c.potwierdzStrona('t');
    expect(html).toContain('Zgłoszenie jest już potwierdzone');
    expect(html).not.toContain('Link nieaktualny');
    expect(html).not.toContain('<form');
  });

  it('POST: potwierdza token z formularza', async () => {
    const { c, zgl } = kontroler('DO_POTWIERDZENIA', 'POTWIERDZONE');
    expect(await c.potwierdz({ token: 'abc' })).toContain('Zgłoszenie potwierdzone');
    expect(zgl.potwierdz).toHaveBeenCalledWith('abc');
  });

  it('obie trasy mają własne CSP z inline style (Caddy nie nadpisuje istniejącego nagłówka)', () => {
    for (const metoda of ['potwierdzStrona', 'potwierdz'] as const) {
      const naglowki = Reflect.getMetadata('__headers__', BetaZgloszeniaPublicController.prototype[metoda]) as { name: string; value: string }[];
      const csp = naglowki.find((h) => h.name === 'Content-Security-Policy')?.value ?? '';
      expect(csp).toContain("style-src 'unsafe-inline'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("default-src 'none'");
    }
  });
});

describe('A1-04 — imię w formularzu /beta i w mailach', () => {
  const bledyImienia = async (imie: string) =>
    (
      await validate(
        plainToInstance(ZgloszenieBetaDto, { imie, email: 'a@b.pl', zakres: ['WORDPRESS'], zgoda: true, zgodaTekst: 'zgoda' }),
        { whitelist: true },
      )
    ).filter((e) => e.property === 'imie');

  it('przyjmuje imiona: polskie znaki, dwuczłonowe, apostrof', async () => {
    for (const imie of ['Ala', 'Łucja-Żaneta', "D'Angelo", 'Anna Maria', 'Zoë']) expect(await bledyImienia(imie)).toEqual([]);
  });

  it('odrzuca zdania z domeną, cyfry, „://” i za długie', async () => {
    for (const imie of ['Twoje konto wygasa dzis - przedluz na verris-platnosci.example', 'Jan2', 'http://x', 'a'.repeat(61)]) {
      expect((await bledyImienia(imie)).length).toBeGreaterThan(0);
    }
  });

  it('mail potwierdzający i mail zmiany nie zawierają imienia z formularza', () => {
    const p = potwierdzenieZgloszeniaBetaTemplate({ to: 'a@b.pl', imie: 'Podejrzana Tresc', confirmUrl: 'https://api.verris.pl/x', panelUrl: 'https://panel.verris.pl' });
    expect(p.text).not.toContain('Podejrzana');
    expect(p.text).toContain('Cześć,');
    const z = zmianaZgloszeniaBetaTemplate({ to: 'a@b.pl', confirmUrl: 'https://api.verris.pl/y', panelUrl: 'https://panel.verris.pl' });
    expect(z.html).toContain('https://api.verris.pl/y');
  });

  it('mail o stanie zaproszenia: tester → panel, nieaktywne → adres kontaktowy; bez nazw zaplecza', () => {
    const t = stanZaproszeniaBetaTemplate({ to: 'a@b.pl', stan: 'TESTER', panelUrl: 'https://panel.verris.pl', kontakt: 'kontakt@verris.pl' });
    const n = stanZaproszeniaBetaTemplate({ to: 'a@b.pl', stan: 'NIEAKTYWNE', panelUrl: 'https://panel.verris.pl', kontakt: 'kontakt@verris.pl' });
    expect(t.text).toContain('/dashboard/beta');
    expect(n.text).toContain('kontakt@verris.pl');
    for (const m of [t, n]) expect(m.text).not.toMatch(/DirectAdmin|2222|\bDA\b/);
  });
});

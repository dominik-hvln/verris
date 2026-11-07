import { describe, expect, it } from 'vitest';
import { PRZYKLADY, plik, render, znaczniki } from './testy.pomoc.ts';

const ADRES_FORMULARZA = 'https://api.verris.test/kreator/formularz/abc123';

/** Fragment HTML jednego formularza (od <form do </form>) w sekcji o danym id. */
function formularzSekcji(html: string, id: string): string {
  const s = html.indexOf(`<section id="${id}"`);
  expect(s, `sekcja ${id}`).toBeGreaterThan(-1);
  const a = html.indexOf('<form', s);
  return html.slice(a, html.indexOf('</form>', a) + 7);
}

describe('formularz kontaktowy – adres wysyłki', () => {
  it('bez adresFormularza (podgląd, link próbny): formularz wyłączony z informacją, bez action i bez /kontakt.php', () => {
    const wynik = render(PRZYKLADY.ceramika!, 'pro');
    const html = plik(wynik, 'index.html');
    expect(html).not.toContain('/kontakt.php');
    const form = formularzSekcji(html, 'kontakt');
    const tagi = znaczniki(form);
    const f = tagi.find((t) => t.nazwa === 'form')!;
    expect(f.atr.action).toBeUndefined();
    expect(f.atr.method).toBeUndefined();
    expect('disabled' in tagi.find((t) => t.nazwa === 'button')!.atr).toBe(true);
    expect(form).toContain('Formularz zadziała po publikacji strony.');
    expect(f.atr['aria-describedby']).toBe('kontakt-info');
    // Bez pól technicznych i bez modułu skryptu formularza.
    expect(tagi.some((t) => t.atr.name === 'powrot' || t.atr.name === 'czas')).toBe(false);
    expect(wynik.pliki.find((p) => p.sciezka === 'assets/kreator.js')?.tresc ?? '').not.toContain('// Formularz kontaktowy');
  });

  it('z adresFormularza: POST na adres API, ukryte pola (sekcja, powrót = bieżąca strona, czas), honeypot, zgoda, status', () => {
    const wynik = render(PRZYKLADY.ceramika!, 'pro', { adresFormularza: ADRES_FORMULARZA });
    const html = plik(wynik, 'index.html');
    const form = formularzSekcji(html, 'kontakt');
    const tagi = znaczniki(form);
    const f = tagi.find((t) => t.nazwa === 'form')!;
    expect(f.atr.action).toBe(ADRES_FORMULARZA);
    expect(f.atr.method).toBe('post');
    const ukryte = Object.fromEntries(tagi.filter((t) => t.atr.type === 'hidden').map((t) => [t.atr.name, t.atr.value]));
    expect(ukryte).toEqual({ formularz: 'kontakt', powrot: 'https://www.przyklad.pl/', czas: '' });
    const hp = tagi.find((t) => t.atr.name === 'strona_www')!;
    expect(hp.atr.tabindex).toBe('-1');
    expect(hp.atr.autocomplete).toBe('off');
    expect(form).toMatch(/<div class="hp" aria-hidden="true">/);
    expect('required' in tagi.find((t) => t.atr.name === 'zgoda')!.atr).toBe(true);
    expect('disabled' in tagi.find((t) => t.nazwa === 'button')!.atr).toBe(false);
    expect(tagi.find((t) => t.atr.class === 'form-status')!.atr.role).toBe('status');
    expect(form).not.toContain('Formularz zadziała po publikacji');
    // Limity długości jak w API.
    expect(tagi.find((t) => t.atr.name === 'imie')!.atr.maxlength).toBe('120');

    const js = plik(wynik, 'assets/kreator.js');
    expect(js).toContain('// Formularz kontaktowy');
    expect(js).toContain("formularz=(wyslano|blad)");
    expect(() => new Function(js)).not.toThrow();
  });

  it('formularz na podstronie wraca na adres podstrony; hero z formularzem też wysyła na adres API', () => {
    const w = structuredClone(PRZYKLADY.ksiegowa!) as unknown as { strony: Array<{ slug: string; tytul: string; sekcje: Array<{ id: string; typ: string }> }> };
    const kontakt = structuredClone((PRZYKLADY.ceramika as unknown as typeof w).strony[0]!.sekcje.find((x) => x.typ === 'kontakt')!);
    kontakt.id = 'napisz';
    w.strony.push({ slug: 'kontakt-biuro', tytul: 'Kontakt', sekcje: [kontakt] });
    const wynik = render(w as never, 'pro', { adresFormularza: ADRES_FORMULARZA });
    const hero = formularzSekcji(plik(wynik, 'index.html'), 'start');
    expect(znaczniki(hero).find((t) => t.nazwa === 'form')!.atr.action).toBe(ADRES_FORMULARZA);
    const pod = znaczniki(formularzSekcji(plik(wynik, 'kontakt-biuro/index.html'), 'napisz'));
    expect(pod.find((t) => t.atr.name === 'powrot')!.atr.value).toBe('https://www.przyklad.pl/kontakt-biuro/');
    expect(pod.find((t) => t.atr.name === 'formularz')!.atr.value).toBe('napisz');
  });

  it('bez adresu strony (ZIP bez domeny) pole powrotu jest puste – uzupełnia je skrypt', () => {
    const wynik = render(PRZYKLADY.ceramika!, 'pro', { adresFormularza: ADRES_FORMULARZA, adresStrony: undefined });
    const powrot = znaczniki(plik(wynik, 'index.html')).find((t) => t.atr.name === 'powrot')!;
    expect(powrot.atr.value).toBe('');
  });

  it('adres formularza jest escapowany w atrybucie', () => {
    const wynik = render(PRZYKLADY.ceramika!, 'pro', { adresFormularza: 'https://api.verris.test/kreator/formularz/x"><script>' });
    expect(plik(wynik, 'index.html')).not.toContain('x"><script>');
  });
});

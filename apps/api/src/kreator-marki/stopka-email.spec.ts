import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INSTRUKCJE_STOPKI, MAKS_STOPKI_BAJTY, StopkaEmailInstrukcja, bladStopki, stopkaTekstowa } from './stopka-email.js';

/**
 * Paczka 130 – stopka e-mail z marki. W repo nie ma toru zapisu podpisu w webmailu (Roundcube na węzłach), więc
 * jedyna implementacja to „instrukcja + kopiuj HTML”. Test pilnuje bezpieczeństwa kodu do wklejenia i tego, że
 * założenie „nie ma toru” jest prawdziwe – gdy ktoś doda zapis tożsamości, test każe zaktualizować implementację.
 * Na starym kodzie czerwony: modułu nie było.
 */
const STOPKA = `<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;color:#1d2b3a">
<tr><td style="padding-right:12px"><img src="https://firma.pl/marka/logo-stopka.png" width="120" height="40" alt="Piekarnia Kłos"></td>
<td><strong>Jan Kowalski</strong><br>Właściciel<br><a href="tel:+48600100200">600 100 200</a> &amp; <a href="mailto:jan@firma.pl">jan@firma.pl</a></td></tr>
<tr><td colspan="2"><a href="https://firma.pl">firma.pl</a></td></tr></table>`;

describe('stopka e-mail – walidacja kodu do wklejenia', () => {
  it('poprawna stopka z marki przechodzi', () => {
    expect(bladStopki(STOPKA)).toBeNull();
  });

  it.each([
    ['<script>alert(1)</script>', 'niedozwolony element'],
    ['<p onclick="x()">a</p>', 'atrybut zdarzenia'],
    ['<img src="http://firma.pl/logo.png">', 'https://'],
    ['<img src="data:image/png;base64,AAAA">', 'https://'],
    ['<a href="javascript:alert(1)">x</a>', 'Linki w stopce'],
    ['<style>p{color:red}</style><p>x</p>', 'niedozwolony element'],
    ['<svg viewBox="0 0 1 1"></svg>', 'niedozwolony element'],
    ['<iframe src="https://x.pl"></iframe>', 'niedozwolony element'],
    ['<p style="width:expression(alert(1))">x</p>', 'niedozwolony kod'],
    ['   ', 'pusta'],
    [`<p>${'x'.repeat(MAKS_STOPKI_BAJTY)}</p>`, 'za długa'],
  ])('%s → błąd', (html, fragment) => {
    expect(bladStopki(html)).toContain(fragment);
  });

  it('wersja tekstowa: wiersze z <br> i <tr>, encje zamienione, bez znaczników', () => {
    expect(stopkaTekstowa(STOPKA)).toBe('Jan Kowalski\nWłaściciel\n600 100 200 & jan@firma.pl\nfirma.pl');
  });
});

describe('StopkaEmailInstrukcja', () => {
  const s = new StopkaEmailInstrukcja();

  it('tryb „instrukcja”: zwraca kod, tekst i instrukcje dla klientów (bez poczty zespołu)', async () => {
    const r = await s.ustaw({ userId: 'u1', skrzynka: ' Jan@Firma.PL ', html: STOPKA });
    expect(s.tryb).toBe('instrukcja');
    expect(r.ustawiono).toBe(false);
    if (r.ustawiono) throw new Error('nieoczekiwane');
    expect(r.skrzynka).toBe('jan@firma.pl');
    expect(r.html).toBe(STOPKA);
    expect(r.tekst).toContain('Jan Kowalski');
    expect(r.instrukcje.map((i) => i.program)).toEqual(['webmail', 'outlook', 'gmail', 'apple-mail', 'thunderbird']);
    // White label: klient nie widzi nazw oprogramowania serwera.
    expect(JSON.stringify(r)).not.toMatch(/Roundcube|DirectAdmin|CustomBuild|2222/);
  });

  it('zła skrzynka albo niebezpieczny kod → 400, nic nie wraca', async () => {
    await expect(s.ustaw({ userId: 'u1', skrzynka: 'nie-adres', html: STOPKA })).rejects.toThrow(BadRequestException);
    await expect(s.ustaw({ userId: 'u1', skrzynka: 'jan@firma.pl', html: '<script>x</script>' })).rejects.toThrow(BadRequestException);
  });

  it('instrukcje nie są jeszcze sprawdzone z dokumentacją programów – panel musi to wiedzieć', () => {
    expect(INSTRUKCJE_STOPKI.every((i) => i.sprawdzone === false && i.kroki.length > 0)).toBe(true);
    expect(INSTRUKCJE_STOPKI.filter((i) => i.tylkoZespol).map((i) => i.program)).toEqual(['sogo']);
  });

  it('założenie: w repo nie ma toru zapisu podpisu w webmailu (Roundcube identities) – inaczej czas na tryb automatyczny', () => {
    const korzen = join(import.meta.dirname, '..', '..', '..', '..');
    const pliki = [
      'apps/api/src/servers/directadmin.service.ts',
      'ops/scripts/node-hosting-profile.sh',
      'ops/roundcube/verris_marka/verris_marka.php',
    ].map((p) => readFileSync(join(korzen, p), 'utf8'));
    for (const t of pliki) expect(t).not.toMatch(/html_signature|identities\s+SET|CMD_EMAIL_SIGNATURE|identity_(create|update)/i);
  });
});

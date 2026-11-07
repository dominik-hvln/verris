import { PRZYKLAD_SALON, walidujStrone, WERSJE_KREATORA, type BriefStrony } from '@verris/kreator';
import { sprawdzBlokiCache } from '../ai/ai-provider.service.js';
import { zlozPodglad } from './podglad.js';
import { fabrykaFunkcjiAiKreatora, fabrykaRendereraKreatora } from './zaleznosci.js';

/**
 * Styk API z prawdziwą biblioteką @verris/kreator (bez sieci): zapytania master promptu spełniają reguły prompt
 * caching, których pilnuje dostawca AI, a podgląd składa się z prawdziwego wyniku renderera.
 */
const SALON = (() => {
  const w = walidujStrone(PRZYKLAD_SALON);
  if (!w.ok) throw new Error(w.bledy.join('; '));
  return w.strona;
})();
const BRIEF: BriefStrony = { opis: 'Salon fryzjerski w Poznaniu: strzyżenie, koloryzacja, pielęgnacja.', typ: 'wizytowka', firma: { nazwa: 'Salon', branza: 'fryzjer' } };

describe('kreator – styk z biblioteką', () => {
  it.each(WERSJE_KREATORA)('wersja %s: bloki systemu z master promptu przechodzą sprawdzBlokiCache (≤ 4 punkty, 1 h przed 5 min)', (wersja) => {
    const ai = fabrykaFunkcjiAiKreatora();
    for (const k of ai.wybierzKierunki(BRIEF, 3, [], () => 0.5, wersja)) {
      const zap = ai.budujZapytanieGeneracji(BRIEF, wersja, k);
      expect(() => sprawdzBlokiCache(zap.system)).not.toThrow();
      expect(zap.system.some((b) => b.cache === '1h')).toBe(true);
      expect(zap.wiadomosci.at(-1)?.role).toBe('user');
    }
    const zmiana = ai.budujZapytanieZmiany(SALON, 'Krótszy nagłówek', 'start', wersja);
    expect(() => sprawdzBlokiCache(zmiana.system)).not.toThrow();
  });

  it('podgląd z prawdziwego renderera: każda podstrona z CSS inline, bez odwołań do plików strony', async () => {
    const pliki = await fabrykaRendereraKreatora().renderuj(SALON, { tryb: 'podglad', wersja: 'hosting', podgladPro: true, bazaFontow: 'https://api.verris.pl/fonts' });
    for (const p of SALON.strony) {
      const html = zlozPodglad(pliki, p.slug);
      expect(html, `podstrona „${p.slug}”`).not.toBeNull();
      expect(html).toContain('<style>');
      expect(html).not.toMatch(/href="[^"]*assets\/styl\.css"/);
      expect(html).not.toMatch(/<script[^>]*src="[^"]*assets\/kreator\.js"/);
    }
  });
});

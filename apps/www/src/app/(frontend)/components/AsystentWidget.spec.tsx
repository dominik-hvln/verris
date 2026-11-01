/**
 * Asystent AI na verris.pl — render na serwerze (bez JS) i dostępność okna (makieta 1.11).
 */
jest.mock('@/lib/asystent', () => ({ zapytajAsystenta: jest.fn(), poprosOTelefonZRozmowy: jest.fn() }));

import { renderToStaticMarkup } from 'react-dom/server';
import { AsystentAvatar, AsystentWidget, CSS_ASYSTENTA } from './AsystentWidget';
import { PODPOWIEDZI, STOPKA_AI, UWAGA_AI } from '@/lib/asystent-stan';

describe('AsystentWidget', () => {
  it('bez flagi NEXT_PUBLIC_ASYSTENT nic nie renderuje', () => {
    expect(renderToStaticMarkup(<AsystentWidget />)).toBe('');
    expect(renderToStaticMarkup(<AsystentWidget wlaczony={false} />)).toBe('');
  });

  it('przycisk: „Masz pytanie? / asystent AI odpowie od razu”, otwiera dialog', () => {
    const html = renderToStaticMarkup(<AsystentWidget wlaczony />);
    expect(html).toContain('Masz pytanie?');
    expect(html).toContain('asystent AI odpowie od razu');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('role="dialog"');
  });

  describe('okno', () => {
    const html = renderToStaticMarkup(<AsystentWidget wlaczony otwarteNaStart />);

    it('dialog modalny z tytułem, log z aria-live', () => {
      expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="asy-tytul"/);
      expect(html).toContain('<h2 id="asy-tytul">Asystent Verris</h2>');
      expect(html).toMatch(/role="log" aria-live="polite"/);
      expect(html).toContain('aria-label="Zamknij asystenta"');
    });

    it('informacja o AI, 3 podpowiedzi i stopka o wiążących dokumentach', () => {
      expect(html).toContain(UWAGA_AI);
      expect(UWAGA_AI).toBe('Rozmawiasz z asystentem AI. Nie podawaj haseł ani danych do płatności.');
      for (const p of PODPOWIEDZI) expect(html).toContain(`>${p}</button>`);
      expect(PODPOWIEDZI).toHaveLength(3);
      expect(html).toContain(STOPKA_AI);
      expect(html).toContain('Porozmawiaj z człowiekiem');
    });

    it('pole pytania z etykietą i limitem 1000 znaków', () => {
      expect(html).toMatch(/<label for="asy-pytanie" class="asy-sr">Twoje pytanie<\/label>/);
      expect(html).toMatch(/maxLength="1000"/i);
      expect(html).toContain('aria-label="Wyślij pytanie"');
    });
  });

  it('avatar: 3 stany jako klasy (animacje w CSS), ukryty przed czytnikiem', () => {
    for (const s of ['czeka', 'szuka', 'odpowiada'] as const) {
      const html = renderToStaticMarkup(<AsystentAvatar stan={s} />);
      expect(html).toContain(`asy-av-${s}`);
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it('CSS: okno 420 px, pełny ekran na telefonie, przycisk nad paskiem zakupu, bez animacji przy reduced-motion', () => {
    expect(CSS_ASYSTENTA).toContain('width:420px');
    expect(CSS_ASYSTENTA).toContain('min(760px');
    expect(CSS_ASYSTENTA).toMatch(/@media\(max-width:640px\)\{[\s\S]*\.asy-panel\{inset:0;width:100%/);
    expect(CSS_ASYSTENTA).toContain('body:has(.mpasek.on) .asy-fab');
    expect(CSS_ASYSTENTA).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*animation:none/);
  });
});

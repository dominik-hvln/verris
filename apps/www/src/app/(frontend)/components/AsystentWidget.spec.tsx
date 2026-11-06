/**
 * Asystent AI na verris.pl — render na serwerze (bez JS) i dostępność okna (makieta 1.11).
 */
jest.mock('@/lib/asystent', () => ({ zapytajAsystenta: jest.fn(), poprosOTelefonZRozmowy: jest.fn() }));

import { renderToStaticMarkup } from 'react-dom/server';
import { AsystentAvatar, AsystentWidget, CSS_ASYSTENTA } from './AsystentWidget';
import { PODPOWIEDZI, STOPKA_AI, UWAGA_AI } from '@/lib/asystent-stan';

describe('AsystentWidget', () => {
  it('bez statusu z API (`wlaczony`) nic nie renderuje – także przy dawnej fladze budowania', () => {
    const flaga = process.env.NEXT_PUBLIC_ASYSTENT;
    process.env.NEXT_PUBLIC_ASYSTENT = '1';
    try {
      expect(renderToStaticMarkup(<AsystentWidget />)).toBe('');
      expect(renderToStaticMarkup(<AsystentWidget wlaczony={false} />)).toBe('');
    } finally {
      if (flaga === undefined) delete process.env.NEXT_PUBLIC_ASYSTENT;
      else process.env.NEXT_PUBLIC_ASYSTENT = flaga;
    }
  });

  it('6.11 (uwaga Dominika): avatar to sygnet w kółku, nie w zaokrąglonym kwadracie', () => {
    const html = renderToStaticMarkup(<AsystentWidget wlaczony />);
    expect(html).toContain('<circle cx="40" cy="40" r="39.5"');
    expect(html).not.toMatch(/<rect[^>]*rx="18"/);
    expect(html).toContain('.asy-av{position:relative;flex:none;display:inline-block;line-height:0;border-radius:50%}');
  });

  it('6.11: przycisk nie podskakuje na komputerze – podnosi się tylko nad widocznym paskiem ceny na telefonie', () => {
    const html = renderToStaticMarkup(<AsystentWidget wlaczony />);
    // Pasek ceny (.mpasek) jest ukryty od 900 px, a klasa .on przełącza się przy przewijaniu na każdej szerokości.
    expect(html).not.toMatch(/(^|[}\n])body:has\(\.mpasek\.on\) \.asy-fab/);
    expect(html).toContain('@media(max-width:899px){html:not([data-formularz-widoczny]) body:has(.mpasek.on):not(:has(.cc-bar)) .asy-fab{');
  });

  it('przycisk: „Masz pytanie? / Odpowiem w kilka sekund”, otwiera dialog', () => {
    const html = renderToStaticMarkup(<AsystentWidget wlaczony />);
    expect(html).toContain('Masz pytanie?');
    expect(html).toContain('Odpowiem w kilka sekund');
    expect(html).not.toContain('asystent AI odpowie od razu');
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
    expect(CSS_ASYSTENTA).toContain('body:has(.mpasek.on):not(:has(.cc-bar)) .asy-fab');
    expect(CSS_ASYSTENTA).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*animation:none/);
  });
});

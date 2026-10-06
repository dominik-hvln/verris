/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import axe from 'axe-core';
import { legalToc } from '@/lib/markdown';
import { LegalDocumentView } from './legal-document-view';
import type { LegalDocument, LegalVersion } from './dokumenty';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

const TRESC = `# Regulamin świadczenia usług Verris

## Rozdział I — Postanowienia ogólne

## §1. Definicje

1. Umowa zostaje zawarta:
   1) w zakresie Konta — z chwilą rejestracji;
   2) w zakresie Usługi — z chwilą opłacenia.
2. Niezwłocznie po zawarciu Umowy Verris przekazuje potwierdzenie.

### 1.1 Uwagi

## §2. Dostępność

| Dostępność w miesiącu | Rekompensata |
| --- | --- |
| od 99,0% do poniżej 99,5% | 5% |

### 1.1 Uwagi
`;

const doc = (version = '1.1.0'): LegalDocument => ({
  kind: 'TERMS',
  version,
  locale: 'pl',
  title: 'Regulamin',
  contentMarkdown: TRESC,
  changelogMarkdown: 'Doprecyzowano §2.',
  publishedAt: '2026-10-06T08:00:00.000Z',
});
const WERSJE: LegalVersion[] = [
  { version: '1.1.0', publishedAt: '2026-10-06T08:00:00.000Z', isCurrent: true },
  { version: '1.0.1', publishedAt: '2026-07-08T10:00:00.000Z', isCurrent: false },
  { version: '1.0.0', publishedAt: '2026-07-01T10:00:00.000Z', isCurrent: false },
];

let root: Root;
let kontener: HTMLElement;
function pokaz(el: React.ReactElement) {
  act(() => root.render(el));
  return kontener;
}
beforeEach(() => {
  kontener = document.createElement('div');
  document.body.appendChild(kontener);
  root = createRoot(kontener);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('legalToc — spis treści z nagłówków', () => {
  it('bierze ## i ### (bez tytułu #), kotwice bez polskich znaków i unikalne', () => {
    expect(legalToc(TRESC)).toEqual([
      { level: 2, text: 'Rozdział I — Postanowienia ogólne', id: 'rozdzial-i-postanowienia-ogolne' },
      { level: 2, text: '§1. Definicje', id: '1-definicje' },
      { level: 3, text: '1.1 Uwagi', id: '1-1-uwagi' },
      { level: 2, text: '§2. Dostępność', id: '2-dostepnosc' },
      { level: 3, text: '1.1 Uwagi', id: '1-1-uwagi-2' },
    ]);
  });
});

describe('LegalDocumentView', () => {
  it('każdy link spisu treści prowadzi do istniejącego nagłówka w treści', () => {
    const el = pokaz(<LegalDocumentView kind="TERMS" doc={doc()} versions={WERSJE} />);
    const spisy = el.querySelectorAll('nav[aria-label="Spis treści"]');
    expect(spisy.length).toBe(2); // przyklejony (desktop) i zwijany <details> (telefon)
    const linki = [...spisy[0].querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(linki).toEqual(legalToc(TRESC).map((h) => `#${h.id}`));
    const artykul = el.querySelector('article')!;
    for (const href of linki) {
      const cel = artykul.querySelector(`[id="${href!.slice(1)}"]`);
      expect(cel?.tagName).toMatch(/^H[2-6]$/);
    }
    expect(el.querySelector('details nav[aria-label="Spis treści"]')).not.toBeNull();
  });

  it('pasek wersji: data obowiązywania, link do historii wersji z odmianą liczby', () => {
    const el = pokaz(<LegalDocumentView kind="TERMS" doc={doc()} versions={WERSJE} />);
    const historia = [...el.querySelectorAll('a')].find((a) => a.textContent?.startsWith('Historia wersji'))!;
    expect(historia.getAttribute('href')).toBe('/legal/terms/versions');
    expect(historia.textContent).toBe('Historia wersji (3 wersje)');
    expect(el.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-06T08:00:00.000Z');
    expect(el.textContent).toContain('Co się zmieniło w wersji 1.1.0');
    expect(el.textContent).not.toContain('archiwalną');
  });

  it('przełącznik dokumentów: wszystkie cztery, bieżący oznaczony aria-current', () => {
    const el = pokaz(<LegalDocumentView kind="PRIVACY" doc={null} versions={[]} />);
    const nav = el.querySelector('nav[aria-label="Przełącz dokument"]')!;
    const linki = [...nav.querySelectorAll('a')];
    expect(linki.map((a) => a.getAttribute('href'))).toEqual([
      '/legal/terms',
      '/legal/privacy',
      '/legal/cookies',
      '/legal/dpa',
    ]);
    expect(linki.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.getAttribute('href'))).toEqual([
      '/legal/privacy',
    ]);
    expect(el.textContent).toContain('Dokument w przygotowaniu');
  });

  it('wersja archiwalna prowadzi do aktualnej', () => {
    const el = pokaz(<LegalDocumentView kind="TERMS" doc={doc('1.0.1')} versions={WERSJE} />);
    const link = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('aktualnej wersji'))!;
    expect(link.getAttribute('href')).toBe('/legal/terms');
    expect(link.textContent).toContain('1.1.0');
  });

  it('podpunkty „1)” zostają w swoim punkcie — numeracja listy się nie zeruje; tabela ma nagłówki', () => {
    const el = pokaz(<LegalDocumentView kind="TERMS" doc={doc()} versions={WERSJE} />);
    const ol = el.querySelector('article ol')!;
    expect(ol.children.length).toBe(2);
    expect([...ol.children[0].querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual([
      '1) w zakresie Konta — z chwilą rejestracji;',
      '2) w zakresie Usługi — z chwilą opłacenia.',
    ]);
    expect(el.querySelector('article th[scope="col"]')?.textContent).toBe('Dostępność w miesiącu');
    expect(el.querySelector('article td')?.getAttribute('data-label')).toBe('Dostępność w miesiącu');
  });

  it('axe bez naruszeń (nagłówki, landmarki, nazwy linków)', async () => {
    const el = pokaz(<LegalDocumentView kind="TERMS" doc={doc()} versions={WERSJE} />);
    const wynik = await axe.run(el, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      // jsdom nie liczy kolorów; kontrast sprawdzony w przeglądarce (axe w Chromium, oba motywy).
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    expect(wynik.violations.map((v) => v.id)).toEqual([]);
  });
});

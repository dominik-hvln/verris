import { ADVANCED_TAB_IDS, EMAIL_TAB_IDS, NAV_GROUPS, TABS, isTabId, visibleTabIds } from './tabs';

/**
 * X-05 — zakładki strony usługi i menu boczne usługi.
 *
 * CO PILNUJE.
 *  - Każda zakładka z `TABS` jest w DOKŁADNIE jednej grupie menu. Zakładka bez
 *    grupy istnieje, ale klient nie ma jak do niej dojść (zniknęła po cichu);
 *    zakładka w dwóch grupach dubluje się w menu.
 *  - „Subskrypcja i płatności" i „Przegląd" są widoczne w KAŻDYM trybie — tryb
 *    prosty chowa narzędzia dla zaawansowanych, nie rozliczenia.
 *  - Dopóki rodzaj usługi nie jest znany, pokazujemy zestaw krótki (poczty),
 *    a nie narzędzia hostingowe usłudze, która może ich nie mieć.
 */

const ALL_IDS = TABS.map((t) => t.id);

describe('X-05 zakładki usługi', () => {
  it('każda zakładka jest w dokładnie jednej grupie menu, grupy nie mają nieznanych id', () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.ids);
    expect([...grouped].sort()).toEqual([...ALL_IDS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('zestawy poczty i zaawansowany składają się z istniejących zakładek', () => {
    for (const id of [...EMAIL_TAB_IDS, ...ADVANCED_TAB_IDS]) expect(isTabId(id)).toBe(true);
  });

  it('isTabId odrzuca null, pusty i nieznany identyfikator', () => {
    expect(isTabId(null)).toBe(false);
    expect(isTabId('')).toBe(false);
    expect(isTabId('admin')).toBe(false);
    expect(isTabId('ssl')).toBe(true);
  });

  it('przegląd i rozliczenia są widoczne w każdym trybie', () => {
    for (const email of [true, false]) {
      for (const kindResolved of [true, false]) {
        for (const simple of [true, false]) {
          const ids = visibleTabIds({ email, kindResolved, simple });
          expect(ids).toContain('overview');
          expect(ids).toContain('subscription');
        }
      }
    }
  });

  it('hosting w trybie pełnym widzi wszystkie zakładki, w prostym — bez zaawansowanych', () => {
    expect(visibleTabIds({ email: false, kindResolved: true, simple: false })).toEqual(ALL_IDS);
    const simple = visibleTabIds({ email: false, kindResolved: true, simple: true });
    expect(simple).toEqual(ALL_IDS.filter((id) => !ADVANCED_TAB_IDS.includes(id)));
  });

  it('poczta i usługa o nieznanym rodzaju → krótki zestaw, tryb prosty go nie zmienia', () => {
    expect(visibleTabIds({ email: true, kindResolved: true, simple: false })).toEqual(EMAIL_TAB_IDS);
    expect(visibleTabIds({ email: true, kindResolved: true, simple: true })).toEqual(EMAIL_TAB_IDS);
    expect(visibleTabIds({ email: false, kindResolved: false, simple: false })).toEqual(EMAIL_TAB_IDS);
  });
});

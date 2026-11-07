import { CENA_KREATORA_PRO, PLANY_KREATORA } from '@verris/kreator/klient';
import { blokadaNowejStrony, moznaDodacPodstrone, nettoZBrutto, opisCenyPro, zl, type StanKreatora } from './kreator';

const stan = (wersja: 'proba' | 'hosting' | 'pro', zuzycie: Partial<StanKreatora['zuzycie']> = {}): StanKreatora =>
  ({
    dostep: true,
    powod: null,
    wersja,
    plan: PLANY_KREATORA[wersja],
    zuzycie: { miesiac: '2026-11', generacje: 0, zmiany: 0, stron: 0, ...zuzycie },
  }) as StanKreatora;

it('cena Pro zawsze z netto i brutto, w formacie z decyzji właściciela', () => {
  expect(opisCenyPro(CENA_KREATORA_PRO)).toBe('9,90 zł brutto/mies. (8,05 zł netto) albo 99 zł brutto/rok (80,49 zł netto)');
  expect(zl(99)).toBe('99 zł');
  expect(nettoZBrutto(123)).toBe(100);
  expect(nettoZBrutto(9.9)).toBe(8.05);
  expect(nettoZBrutto(99)).toBe(80.49);
});

it('nowa strona: blokada przy limicie stron i generacji (jak POST /kreator/strony), odmiana liczebników', () => {
  expect(blokadaNowejStrony(stan('hosting'))).toBeNull();
  expect(blokadaNowejStrony(stan('proba', { stron: 1 }))).toBe('Masz już 1 stronę – w tej wersji kreatora limit to 1 strona. Usuń jedną z nich albo przejdź na Kreator Pro.');
  expect(blokadaNowejStrony(stan('hosting', { stron: 3 }))).toContain('limit to 3 strony');
  expect(blokadaNowejStrony(stan('pro', { stron: 10 }))).not.toContain('Kreator Pro');
  expect(blokadaNowejStrony(stan('hosting', { generacje: 3 }))).toContain('Wykorzystano miesięczny limit (3 generacje)');
  expect(blokadaNowejStrony({ ...stan('hosting'), dostep: false, powod: 'Zamów hosting.' })).toBe('Zamów hosting.');
});

it('limit podstron z planu; Pro bez limitu', () => {
  expect(moznaDodacPodstrone(PLANY_KREATORA.hosting, 4)).toBe(true);
  expect(moznaDodacPodstrone(PLANY_KREATORA.hosting, 5)).toBe(false);
  expect(moznaDodacPodstrone(PLANY_KREATORA.pro, 500)).toBe(true);
});

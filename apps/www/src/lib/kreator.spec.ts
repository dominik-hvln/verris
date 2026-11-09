/**
 * Paczka 123 — liczby Verris Kreatora na verris.pl są przepisane z kodu produktu (www nie zależy od @verris/kreator).
 * Test czyta źródła i czerwieni się, gdy plan kreatora albo ważność linku podglądu zmieni się bez strony www.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DNI_LINKU_PODGLADU, ileLubBezLimitu, JEZYKI_KREATORA_PRO, LIMITY_KREATORA } from './kreator';

const KORZEN = join(__dirname, '../../../..');
const PLANY = readFileSync(join(KORZEN, 'libs/kreator/src/plany.ts'), 'utf8');

/** Pola liczbowe jednej wersji z obiektu PLANY_KREATORA (np. `hosting: { …, stron: 3, podstron: 5, … }`). */
function wersja(nazwa: 'proba' | 'hosting' | 'pro') {
  const blok = new RegExp(`\\n  ${nazwa}: \\{([\\s\\S]*?)\\n  \\},`).exec(PLANY)?.[1];
  if (!blok) throw new Error(`brak wersji ${nazwa} w plany.ts`);
  const pole = (k: string) => {
    const v = new RegExp(`\\b${k}: (null|\\d+)`).exec(blok)?.[1];
    if (v === undefined) throw new Error(`brak pola ${k} w wersji ${nazwa}`);
    return v === 'null' ? null : Number(v);
  };
  return {
    stron: pole('stron'),
    podstron: pole('podstron'),
    generacjiMies: pole('generacjiMies'),
    zmianAiMies: pole('zmianAiMies'),
    wariantyGeneracji: pole('wariantyGeneracji'),
    wielojezycznosc: (() => {
      const v = /\bwielojezycznosc: (true|false)/.exec(blok)?.[1];
      if (v === undefined) throw new Error(`brak pola wielojezycznosc w wersji ${nazwa}`);
      return v === 'true';
    })(),
  };
}

describe('Verris Kreator – liczby na www zgodne z kodem produktu', () => {
  it.each(['proba', 'hosting', 'pro'] as const)('limity wersji „%s” = PLANY_KREATORA w libs/kreator/src/plany.ts', (w) => {
    expect(LIMITY_KREATORA[w]).toEqual(wersja(w));
  });

  it('języki Kreatora Pro (paczka 124) = JEZYKI_DODATKOWE w libs/kreator/src/jezyki.ts', () => {
    const zrodlo = readFileSync(join(KORZEN, 'libs/kreator/src/jezyki.ts'), 'utf8');
    expect(/JEZYKI_DODATKOWE = \[([^\]]*)\]/.exec(zrodlo)?.[1]).toBe("'en', 'de', 'uk'");
    expect(/NAZWY_JEZYKOW_PL[^{]*\{([^}]*)\}/.exec(zrodlo)?.[1]).toContain("en: 'angielski', de: 'niemiecki', uk: 'ukraiński'");
    expect([...JEZYKI_KREATORA_PRO]).toEqual(['angielski', 'niemiecki', 'ukraiński']);
  });

  it('link podglądu w okresie próbnym: tyle dni, ile WAZNOSC_LINKU_MS w publikacji', () => {
    const zrodlo = readFileSync(join(KORZEN, 'apps/api/src/kreator/publikacja.service.ts'), 'utf8');
    const m = /WAZNOSC_LINKU_MS = (\d+) \* 24 \* 60 \* 60 \* 1000/.exec(zrodlo);
    expect(m).not.toBeNull();
    expect(DNI_LINKU_PODGLADU).toBe(Number(m![1]));
  });

  it('liczebniki: 1 strona, 3 strony, 10 stron, bez limitu', () => {
    expect(ileLubBezLimitu(1, 'strona', 'strony', 'stron')).toBe('1 strona');
    expect(ileLubBezLimitu(3, 'strona', 'strony', 'stron')).toBe('3 strony');
    expect(ileLubBezLimitu(10, 'strona', 'strony', 'stron')).toBe('10 stron');
    expect(ileLubBezLimitu(null, 'podstrona', 'podstrony', 'podstron')).toBe('bez limitu');
  });
});

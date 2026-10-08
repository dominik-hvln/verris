import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { SERVICE_EVENT_PL } from '@verris/contracts';

/**
 * Każdy typ zdarzenia usługi zapisywany przez API (`subscriptionEvent.create({ data: { type: '…' } })`) ma polską
 * etykietę w `SERVICE_EVENT_PL`.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * PB-45 (08.10) dodało zdarzenia MIGRATION_CONSENT_REQUESTED / _REJECTED / _EXPIRED bez etykiet. Klient widział
 * na osi „Co się działo” ogólne „Zmiana w usłudze”, a obsługa w „Historii migracji” na karcie usługi (PB-44)
 * — surowy kod, bo `etykieta()` przy braku wpisu zwraca kod. Każde zadanie z osobna było zielone: zdarzenia
 * dopisało jedno, a historię migracji pokazało drugie.
 *
 * Strażnik czyta literały `type: '…'` w wywołaniach `subscriptionEvent.create` w kodzie API (bez testów).
 * Typy składane w zmiennej (`type: queuedType`) wymykają się mu — te mają osobne testy w swoich modułach.
 */
const SRC = resolve(import.meta.dirname, '..');

function pliki(katalog: string): string[] {
  const out: string[] = [];
  for (const wpis of readdirSync(katalog)) {
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) out.push(...pliki(sciezka));
    else if (wpis.endsWith('.ts') && !wpis.endsWith('.spec.ts')) out.push(sciezka);
  }
  return out;
}

function typyZdarzen(): Map<string, string> {
  const typy = new Map<string, string>();
  const wywolanie = /subscriptionEvent\.create(?:Many)?\(\s*\{\s*data:\s*\{([\s\S]{0,400}?)\}/g;
  for (const plik of pliki(SRC)) {
    const tekst = readFileSync(plik, 'utf8');
    for (const m of tekst.matchAll(wywolanie)) {
      const typ = /type:\s*'([A-Z][A-Z0-9_]+)'/.exec(m[1])?.[1];
      if (typ && !typy.has(typ)) typy.set(typ, relative(SRC, plik));
    }
  }
  return typy;
}

describe('Zdarzenia usługi zapisywane przez API mają polskie etykiety', () => {
  const typy = typyZdarzen();

  it('strażnik ma czego pilnować', () => {
    expect(typy.size).toBeGreaterThan(20);
    // PB-45 — zdarzenia zgody na migrację przygotowaną przez obsługę.
    expect(typy.has('MIGRATION_CONSENT_REQUESTED')).toBe(true);
  });

  it('każdy literał typu zdarzenia ma wpis w SERVICE_EVENT_PL', () => {
    const bez = [...typy].filter(([typ]) => !SERVICE_EVENT_PL[typ]).map(([typ, plik]) => `${typ} (${plik})`);
    expect(bez).toEqual([]);
  });
});

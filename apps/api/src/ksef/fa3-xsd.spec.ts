import { readdirSync, readFileSync } from 'node:fs';
import { FAKTURY_TESTOWE, xmlFaktury } from '../test/faktury-ksef-testowe.js';
import { schematyFa3, walidatorZModulu, walidujFa3Xsd } from './fa3-xsd.js';

/**
 * KSeF 07.11 — walidacja XSD FA(3) 1-0E w API przed wysyłką, bez natywnego xmllint (libxml2 w wasm).
 * Do dziś schemat sprawdzał tylko test `fa3-xml.xsd.spec.ts`, pomijany, gdy w systemie nie ma xmllint.
 */
describe('FA(3) – walidacja XSD przed wysyłką (xmllint-wasm)', () => {
  it('schemat w paczce = pliki .xsd w schemat-fa3/ (oficjalna kopia z CIRFMF/ksef-docs)', () => {
    const katalog = new URL('./schemat-fa3/', import.meta.url);
    const pliki = readdirSync(katalog).filter((f) => f.endsWith('.xsd')).sort();
    expect(Object.keys(schematyFa3()).sort()).toEqual(pliki);
    for (const f of pliki) expect(schematyFa3()[f]).toBe(readFileSync(new URL(f, katalog), 'utf8'));
  });

  it.each(FAKTURY_TESTOWE)('%s: zgodna', async (_n, faktura) => {
    expect(await walidujFa3Xsd(xmlFaktury(faktura()))).toEqual({ ok: true, bledy: [] });
  });

  it('niezgodna (bez obowiązkowych JST/GV): odrzucona z czytelnym powodem', async () => {
    const [, b2b] = FAKTURY_TESTOWE[0];
    const zly = xmlFaktury(b2b()).replace(/\n {4}<JST>2<\/JST>\n {4}<GV>2<\/GV>/, '');
    const w = await walidujFa3Xsd(zly);
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toMatch(/wiersz \d+: .*Podmiot2/);
  });

  it('import CommonJS: `validateXML` wprost albo pod `default`', () => {
    const f = async () => ({ valid: true, errors: [] });
    expect(walidatorZModulu({ validateXML: f })).toBe(f);
    expect(walidatorZModulu({ default: { validateXML: f } })).toBe(f);
    expect(() => walidatorZModulu({})).toThrow(/validateXML/);
  });
});

import { gunzipSync } from 'zlib';
import * as xmllintModul from 'xmllint-wasm';
import { SCHEMATY_FA3_GZ_B64 } from './schemat-fa3/schematy-fa3.generated.js';

/**
 * Walidacja pliku faktury oficjalnym XSD FA(3) 1-0E PRZED wysyłką do KSeF.
 *
 * Schemat: https://github.com/CIRFMF/ksef-docs/tree/main/faktury/schemy/FA (kopia w `schemat-fa3/`).
 * KSeF odrzuca dokument niezgodny ze schematem (faktury/weryfikacja-faktury.md, „Weryfikacja XML”).
 * Do 2026-11-07 schemat sprawdzał tylko test (xmllint w systemie, pomijany, gdy go nie ma) — faktura
 * z błędem danych wychodziła do KSeF i wracała jako odrzucona dopiero po cyklu.
 *
 * Walidator: `xmllint-wasm` — libxml2 (ten sam silnik co `xmllint`) skompilowany do WebAssembly,
 * bez natywnych binariów w obrazie (obraz API to node:trixie-slim bez libxml2-utils). Uruchamia się
 * w wątku roboczym, więc nie blokuje pętli zdarzeń.
 *
 * Schemat jest w paczce API jako moduł wygenerowany z plików `.xsd` (bundler nie kopiuje zasobów).
 * Odtworzenie modułu po aktualizacji schematu w `schemat-fa3/`:
 *   node -e "const fs=require('fs'),z=require('zlib');const d='schemat-fa3/';const o={};
 *     for(const f of fs.readdirSync(d).filter(f=>f.endsWith('.xsd')).sort())o[f]=fs.readFileSync(d+f,'utf8');
 *     console.log(z.gzipSync(Buffer.from(JSON.stringify(o)),{level:9}).toString('base64'))"
 * i wklejenie wyniku do `schemat-fa3/schematy-fa3.generated.ts` (test `fa3-xsd.spec.ts` pilnuje zgodności).
 */

export const PLIK_GLOWNY_FA3 = 'schemat_FA(3)_v1-0E.xsd';

interface PlikXml {
  fileName: string;
  contents: string;
}
interface WynikXmllint {
  valid: boolean;
  errors: Array<{ message: string; loc: { lineNumber: number } | null }>;
}
type ValidateXml = (o: { xml: PlikXml[]; schema: PlikXml[]; preload: PlikXml[] }) => Promise<WynikXmllint>;

let schematy: Record<string, string> | null = null;
export function schematyFa3(): Record<string, string> {
  schematy ??= JSON.parse(gunzipSync(Buffer.from(SCHEMATY_FA3_GZ_B64, 'base64')).toString('utf8')) as Record<string, string>;
  return schematy;
}

/**
 * `xmllint-wasm` to paczka CommonJS — jak przy `qrcode` (kod-qr-ksef.ts) import ma w Node ESM i w bundlerze
 * obrazu dwa kształty: `validateXML` wprost albo pod `default`. Bierzemy ten, który jest.
 */
export function walidatorZModulu(modul: unknown): ValidateXml {
  const m = modul as { validateXML?: unknown; default?: { validateXML?: unknown } };
  if (typeof m?.validateXML === 'function') return m.validateXML as ValidateXml;
  if (typeof m?.default?.validateXML === 'function') return m.default.validateXML as ValidateXml;
  throw new Error('xmllint-wasm: brak funkcji validateXML – nieznany kształt modułu');
}
const walidator = (): ValidateXml => walidatorZModulu(xmllintModul);

export interface WynikWalidacjiFa3 {
  ok: boolean;
  /** Błędy schematu (wiersz: komunikat libxml2) — do pokazania operatorowi. */
  bledy: string[];
}

export async function walidujFa3Xsd(xml: string): Promise<WynikWalidacjiFa3> {
  const s = schematyFa3();
  const wynik = await walidator()({
    xml: [{ fileName: 'faktura.xml', contents: xml }],
    schema: [{ fileName: PLIK_GLOWNY_FA3, contents: s[PLIK_GLOWNY_FA3] }],
    preload: Object.entries(s)
      .filter(([n]) => n !== PLIK_GLOWNY_FA3)
      .map(([fileName, contents]) => ({ fileName, contents })),
  });
  return {
    ok: wynik.valid,
    bledy: wynik.errors.map((e) => (e.loc ? `wiersz ${e.loc.lineNumber}: ` : '') + e.message.replace(/^Schemas validity error : /, '')),
  };
}

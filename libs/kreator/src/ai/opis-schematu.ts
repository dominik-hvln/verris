import { z } from 'zod';
import { CelLinku, Obraz, Przycisk, Strona } from '../model.ts';

/**
 * Zwięzły opis modelu strony dla master promptu, generowany z JSON Schema (`z.toJSONSchema(Strona)`,
 * zod 4, `io: 'input'` – pola z wartością domyślną są opcjonalne). Pełny JSON Schema ma ~21,5 tys. znaków
 * (wzorce e-mail, 13 × powtórzone pola bazowe sekcji); zapis w stylu TypeScript niesie to samo przy
 * ok. połowie tokenów i jest czytelniejszy dla modelu. Generujemy go z tego samego schematu, którym
 * walidujemy odpowiedź, więc opis nie rozjedzie się z modelem. Wynik jest deterministyczny.
 */

interface Wezel {
  type?: string | string[];
  properties?: Record<string, Wezel>;
  required?: string[];
  items?: Wezel;
  enum?: (string | number)[];
  const?: string | number | boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  format?: string;
  anyOf?: Wezel[];
  oneOf?: Wezel[];
}

const lit = (v: unknown) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v));

function zakresTekstu(min?: number, max?: number): string {
  if (min && max) return `(${min}–${max})`;
  if (max) return `(≤${max})`;
  if (min) return `(≥${min})`;
  return '';
}

/** Powtarzalne fragmenty modelu opisane raz, pod nazwą (porównanie po treści schematu). */
let nazwane: Map<string, string> | null = null;
function nazwaFragmentu(w: Wezel): string | undefined {
  if (!nazwane) {
    nazwane = new Map();
    for (const [nazwa, schemat] of [['Obraz', Obraz], ['Przycisk', Przycisk], ['CelLinku', CelLinku]] as const) {
      const { $schema: _pomijany, ...reszta } = z.toJSONSchema(schemat, { io: 'input' }) as Wezel & { $schema?: string };
      nazwane.set(JSON.stringify(reszta), nazwa);
    }
  }
  return nazwane.get(JSON.stringify(w));
}

function opisWezla(w: Wezel, wciecie: string, definicje: Map<string, string>): string {
  const nazwa = nazwaFragmentu(w);
  if (nazwa) {
    if (!definicje.has(nazwa)) definicje.set(nazwa, '');
    if (!definicje.get(nazwa)) definicje.set(nazwa, opisSurowy(w, '', definicje));
    return nazwa;
  }
  return opisSurowy(w, wciecie, definicje);
}

function opisSurowy(w: Wezel, wciecie: string, definicje: Map<string, string>): string {
  if (w.oneOf) return opisUnii(w.oneOf, wciecie, definicje);
  if (w.anyOf) return w.anyOf.map((x) => opisWezla(x, wciecie, definicje)).join(' | ');
  if (w.const !== undefined) return lit(w.const);
  if (w.enum) return w.enum.map(lit).join(' | ');
  switch (w.type) {
    case 'string':
      if (w.format === 'email') return `string${zakresTekstu(w.minLength, w.maxLength)} e-mail`;
      if (w.pattern === '^#[0-9a-fA-F]{6}$') return "'#RRGGBB'";
      return `string${zakresTekstu(w.minLength, w.maxLength)}${w.pattern ? ` /${w.pattern}/` : ''}`;
    case 'number':
    case 'integer': {
      const t = w.type === 'integer' ? 'int' : 'number';
      return w.minimum !== undefined || w.maximum !== undefined ? `${t}(${w.minimum ?? ''}–${w.maximum ?? ''})` : t;
    }
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array': {
      const el = opisWezla(w.items ?? {}, wciecie, definicje);
      const zawiniety = /[|\n ]/.test(el) && !el.startsWith('{') ? `(${el})` : el;
      return `${zawiniety}[]${zakresTekstu(w.minItems, w.maxItems).replace('(', ' (').replace(')', ' el.)')}`;
    }
    case 'object':
      return opisObiektu(w, wciecie, definicje);
    default:
      return 'unknown';
  }
}

function opisPola(nazwa: string, w: Wezel, wymagane: Set<string>, wciecie: string, definicje: Map<string, string>): string {
  const opc = !wymagane.has(nazwa) || w.default !== undefined;
  const dom = w.default !== undefined ? ` = ${JSON.stringify(w.default)}` : '';
  return `${wciecie}${nazwa}${opc ? '?' : ''}: ${opisWezla(w, wciecie, definicje)}${dom};`;
}

function opisObiektu(w: Wezel, wciecie: string, definicje: Map<string, string>, pomin: Set<string> = new Set()): string {
  const wymagane = new Set(w.required ?? []);
  const wewn = wciecie + '  ';
  const pola = Object.entries(w.properties ?? {})
    .filter(([n]) => !pomin.has(n))
    .map(([n, p]) => opisPola(n, p, wymagane, wewn, definicje));
  return `{\n${pola.join('\n')}\n${wciecie}}`;
}

/** Unia sekcji: wspólne pola (id, wariant, tlo…) raz jako `BazaSekcji`, każdy typ osobno. */
function opisUnii(warianty: Wezel[], wciecie: string, definicje: Map<string, string>): string {
  const typy = warianty.map((v) => v.properties?.typ?.const);
  if (!typy.every((t) => typeof t === 'string')) return warianty.map((v) => opisWezla(v, wciecie, definicje)).join(' | ');
  const pierwszy = warianty[0].properties ?? {};
  const wspolne = Object.keys(pierwszy).filter(
    (k) => k !== 'typ' && k !== 'dane' && warianty.every((v) => JSON.stringify(v.properties?.[k]) === JSON.stringify(pierwszy[k])),
  );
  const baza: Wezel = { type: 'object', properties: Object.fromEntries(wspolne.map((k) => [k, pierwszy[k]])), required: warianty[0].required };
  definicje.set('BazaSekcji', opisObiektu(baza, '', definicje));
  const linie = warianty.map((v) => {
    const typ = v.properties?.typ?.const as string;
    const nazwa = `Sekcja_${typ}`;
    const reszta = opisObiektu(v, '', definicje, new Set(wspolne));
    definicje.set(nazwa, `BazaSekcji & ${reszta}`);
    return nazwa;
  });
  definicje.set('Sekcja', linie.join(' | '));
  return 'Sekcja';
}

let pamiec: string | null = null;

/** Opis modelu Strona w notacji TypeScript (z legendą w master prompcie). */
export function opisModeluStrony(): string {
  if (pamiec !== null) return pamiec;
  const schemat = z.toJSONSchema(Strona, { io: 'input' }) as Wezel;
  const definicje = new Map<string, string>();
  const glowny = opisObiektu(schemat, '', definicje);
  const kolejnosc = ['CelLinku', 'Przycisk', 'Obraz', 'BazaSekcji', ...[...definicje.keys()].filter((k) => k.startsWith('Sekcja_')), 'Sekcja'];
  const czesci = [`type Strona = ${glowny};`, ...kolejnosc.filter((k) => definicje.has(k)).map((k) => `type ${k} = ${definicje.get(k)};`)];
  pamiec = czesci.join('\n\n');
  return pamiec;
}

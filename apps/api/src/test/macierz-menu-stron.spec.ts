import { ExecutionContext, ForbiddenException, RequestMethod, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { ROLE_SYSTEMOWE } from '../staff-roles/role-systemowe.js';

/**
 * Weryfikacja 11.10 — macierz panelu operatora: dla KAŻDEJ roli systemowej pozycje menu, które rola widzi, to
 * podzbiór stron, które się jej otworzą. „Otworzy się” = bramka strony przepuszcza (STRONY.perm) ORAZ prawdziwi
 * strażnicy API (RolesGuard + StaffPermissionsGuard) wpuszczają rolę na każdą trasę GET, którą strona czyta przy
 * wejściu (STRONY.api). Wcześniej menu, bramka i API były zgodne tylko parami (menu = bramka w teście panelu,
 * API osobno) — L1 dostawał „Wymaga SUBSCRIPTIONS_MANAGE” na liście usług, choć karta usługi się otwierała.
 *
 * Panel nie jest importowany (paczka API nie sięga kodem do paneli — testy-nie-siegaja-poza-swoja-paczke.spec.ts):
 * mapę stron i menu czytamy jako tekst. Strażnik liczności pilnuje, że parser niczego nie zgubił.
 */
const KORZEN = resolve(import.meta.dirname, '..', '..', '..', '..');
const PLIK_STRON = join(KORZEN, 'apps/admin-panel/src/lib/uprawnienia-stron.ts');
const PLIK_MENU = join(KORZEN, 'apps/admin-panel/src/components/admin-shell.tsx');
const PLIK_AKCJI_KLIENTA = join(KORZEN, 'apps/admin-panel/src/lib/akcje/klient.ts');

type Warunek = null | string | string[] | { wszystkie: string[] };
/** `null`, `"X"`, `["A", "B"]` albo `{ wszystkie: ["A", "B"] }` — zapis jak w panelu (lib/akcje/wezel.ts). */
const warunek = (tekst: string): Warunek => {
  if (tekst === 'null') return null;
  const wszystkie = /^\{ wszystkie: (\[[^\]]*\]) \}$/.exec(tekst);
  if (wszystkie) return { wszystkie: JSON.parse(wszystkie[1]!) as string[] };
  return JSON.parse(tekst) as string | string[];
};

interface Strona {
  perm: Warunek;
  api: string[] | null;
}

function stronyPanelu(): Map<string, Strona> {
  const tekst = readFileSync(PLIK_STRON, 'utf-8');
  const wpis = /^\s*"(\/[^"]*)": \{ perm: (null|"[^"]+"|\[[^\]]*\]), tytul: "[^"]*"(?:, api: \[([^\]]*)\])? \},$/;
  const out = new Map<string, Strona>();
  for (const linia of tekst.split('\n')) {
    const m = wpis.exec(linia);
    if (!m) continue;
    const api = m[3] === undefined ? null : m[3].trim() ? (JSON.parse(`[${m[3]}]`) as string[]) : [];
    out.set(m[1]!, { perm: warunek(m[2]!), api });
  }
  // Strażnik parsera: każda linia-wpis mapy (`  "/…": {`) została rozpoznana.
  expect(out.size).toBe(tekst.split('\n').filter((l) => /^\s*"\/[^"]*": \{/.test(l)).length);
  return out;
}

function pozycjeMenu(): { href: string; perm: Warunek }[] {
  const tekst = readFileSync(PLIK_MENU, 'utf-8');
  const re = /name: "[^"]+",\s*href: "(\/[^"]*)"(?:,\s*perm: ("[^"]+"|\[[^\]]*\]))?/g;
  return [...tekst.matchAll(re)].map((m) => ({ href: m[1]!, perm: m[2] ? warunek(m[2]) : null }));
}

/**
 * Działania na karcie klienta z trasą API (lib/akcje/klient.ts, pole `api`) — przyciski w nagłówku karty,
 * „Operacje wrażliwe” i lista „Działania” biorą z nich powód blokady.
 */
function akcjeKlienta(): { id: string; perm: Warunek; metoda: string; sciezka: string }[] {
  const tekst = readFileSync(PLIK_AKCJI_KLIENTA, 'utf-8');
  const bloki = tekst.split(/\n {2}\{\n/).slice(1);
  return bloki.flatMap((b) => {
    const id = /^\s*id: "([^"]+)",/.exec(b)?.[1];
    const perm = /\n\s*perm: (.+),\n/.exec(b)?.[1];
    const api = /\n\s*api: "([A-Z]+) ([^"]+)",\n/.exec(b);
    if (!id || !perm || !api) return [];
    return [{ id, perm: warunek(perm), metoda: api[1]!, sciezka: api[2]! }];
  });
}

/** Warunek strony/menu jak brakUprawnienia w panelu (dla STAFF): „ADMIN” — nigdy, lista — którekolwiek, `wszystkie` — każde. */
function spelnia(w: Warunek, uprawnienia: readonly string[]): boolean {
  if (w === null) return true;
  if (!Array.isArray(w) && typeof w === 'object') return !w.wszystkie.includes('ADMIN') && w.wszystkie.every((p) => uprawnienia.includes(p));
  const lista = typeof w === 'string' ? [w] : w;
  if (lista.includes('ADMIN')) return false;
  return lista.some((p) => uprawnienia.includes(p));
}

type Trasa = { nazwa: string; klasa: Type<unknown>; handler: object; sciezka: string; metoda: string };

function plikiKontrolerow(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return plikiKontrolerow(p);
    return n.endsWith('.controller.ts') && readFileSync(p, 'utf-8').includes('@Controller(') ? [p] : [];
  });
}

async function wszystkieTrasy(): Promise<Trasa[]> {
  const out: Trasa[] = [];
  for (const plik of plikiKontrolerow(resolve(import.meta.dirname, '..'))) {
    const mod = (await import(plik)) as Record<string, unknown>;
    for (const [nazwa, klasa] of Object.entries(mod)) {
      if (typeof klasa !== 'function') continue;
      const baza = Reflect.getMetadata(PATH_METADATA, klasa) as string | undefined;
      if (typeof baza !== 'string') continue;
      for (const metoda of Object.getOwnPropertyNames(klasa.prototype)) {
        const handler = (klasa.prototype as Record<string, unknown>)[metoda];
        if (metoda === 'constructor' || typeof handler !== 'function') continue;
        const rodzaj = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (rodzaj === undefined) continue;
        const sciezka = [baza, String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')].join('/').split('/').filter(Boolean).join('/');
        out.push({ nazwa: `${nazwa}.${metoda}`, klasa: klasa as Type<unknown>, handler: handler as object, sciezka, metoda: RequestMethod[rodzaj] });
      }
    }
  }
  return out;
}

/** `admin/users/:userId/x` i `admin/users/:id/x` to ta sama trasa. */
const ksztalt = (s: string) => s.replace(/:[^/]+/g, ':');

async function wpuszcza(t: Trasa, uprawnienia: readonly string[]): Promise<boolean> {
  const reflector = new Reflector();
  const prisma = { user: { findUnique: async () => ({ staffRole: { id: 'r', name: 'r', permissions: [...uprawnienia] } }) } };
  const ctx = {
    getHandler: () => t.handler,
    getClass: () => t.klasa,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'op', role: 'STAFF' } }) }),
  } as unknown as ExecutionContext;
  const straznicy = [
    ...((Reflect.getMetadata(GUARDS_METADATA, t.klasa) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, t.handler) as unknown[]) ?? []),
  ];
  for (const S of straznicy) {
    try {
      if (S === RolesGuard && !new RolesGuard(reflector).canActivate(ctx)) return false;
      if (S === StaffPermissionsGuard && !(await new StaffPermissionsGuard(reflector, prisma as never).canActivate(ctx))) return false;
    } catch (e) {
      if (e instanceof ForbiddenException) return false;
      throw e;
    }
  }
  return true;
}

const STRONY = stronyPanelu();
const MENU = pozycjeMenu();
const WSZYSTKIE_TRASY = await wszystkieTrasy();
const trasa = (sciezka: string, metoda = 'GET') => WSZYSTKIE_TRASY.filter((t) => t.metoda === metoda && ksztalt(t.sciezka) === ksztalt(sciezka));

/** Strona otwiera się roli: bramka strony i strażnicy każdej trasy czytanej przy wejściu. */
async function otwieraSie(href: string, uprawnienia: readonly string[]): Promise<string | null> {
  const s = STRONY.get(href);
  if (!s) return 'brak strony w mapie STRONY';
  if (!spelnia(s.perm, uprawnienia)) return `bramka strony: ${JSON.stringify(s.perm)}`;
  for (const a of s.api ?? []) {
    for (const t of trasa(a)) if (!(await wpuszcza(t, uprawnienia))) return `API ${a} (${t.nazwa}) — 403`;
  }
  return null;
}

describe('weryfikacja 11.10 — macierz: menu ⊆ strony, które się otworzą (każda rola systemowa)', () => {
  it('parser widzi mapę stron i menu (strażnik przed pustym testem)', () => {
    expect(STRONY.size).toBeGreaterThan(70);
    expect(MENU.length).toBeGreaterThan(50);
    expect(MENU.map((m) => m.href)).toEqual(expect.arrayContaining(['/resellers', '/partners', '/metrics', '/subscriptions', '/knowledge-base']));
  });

  it('każda strona dla operatora (perm ≠ ADMIN) ma listę tras wejścia, a każda trasa z listy istnieje jako GET w API', () => {
    const bezListy = [...STRONY].filter(([, s]) => s.perm !== 'ADMIN' && s.api === null).map(([h]) => h);
    expect(bezListy).toEqual([]);
    const nieznane = [...STRONY].flatMap(([h, s]) => (s.api ?? []).filter((a) => trasa(a).length === 0).map((a) => `${h}: ${a}`));
    expect(nieznane).toEqual([]);
  });

  it('pozycja menu = uprawnienie strony (to samo, co sprawdza bramka)', () => {
    const strony = (href: string) => (STRONY.has(href) ? STRONY.get(href)!.perm : 'brak wpisu');
    const rozjazdy = MENU.filter((m) => JSON.stringify(m.perm) !== JSON.stringify(strony(m.href))).map(
      (m) => `${m.href}: menu ${JSON.stringify(m.perm)}, strona ${JSON.stringify(strony(m.href))}`,
    );
    expect(rozjazdy).toEqual([]);
  });

  it.each(ROLE_SYSTEMOWE.map((r) => [r.name, r.permissions] as const))('%s: każda widoczna pozycja menu się otwiera', async (_rola, uprawnienia) => {
    const zle: string[] = [];
    for (const m of MENU) {
      if (!spelnia(m.perm, uprawnienia)) continue;
      const powod = await otwieraSie(m.href, uprawnienia);
      if (powod) zle.push(`${m.href}: ${powod}`);
    }
    expect(zle).toEqual([]);
  });

  it('L1 Konsultant: bez Metryk, Partnerów-resellerów i edycji; z listą usług w trybie odczytu (decyzje 11.10)', async () => {
    const l1 = ROLE_SYSTEMOWE.find((r) => r.name === 'L1 Konsultant')!.permissions;
    const widoczne = MENU.filter((m) => spelnia(m.perm, l1)).map((m) => m.href);
    expect(widoczne).not.toContain('/metrics');
    expect(widoczne).not.toContain('/resellers');
    expect(widoczne).toContain('/subscriptions');
    expect(await otwieraSie('/subscriptions', l1)).toBeNull();
    expect(await otwieraSie('/metrics', l1)).toMatch(/METRICS_VIEW/);
    expect(await otwieraSie('/resellers', l1)).toMatch(/CUSTOMERS_MANAGE/);
  });
});

/**
 * Weryfikacja 11.10 (prod, „L1 Konsultant”) — na karcie klienta lista „Działania” mówiła „Wymaga BILLING_MANAGE”, a przyciski
 * w nagłówku („Dodaj kredyty”, „Napisz do klienta”, „Zaloguj jako klient”) i „Operacje wrażliwe” (reset hasła, zmiana
 * e-maila, blokada, usunięcie RODO) były aktywne. Przyciski biorą teraz powód z rejestru lib/akcje/klient.ts; tu — że rejestr
 * zgadza się z prawdziwymi strażnikami tras, które te przyciski wołają: aktywne w panelu ⇔ API przepuści (dla każdej roli).
 */
describe('weryfikacja 11.10 — przyciski karty klienta ⇔ strażnicy API (każda rola systemowa)', () => {
  const AKCJE = akcjeKlienta();
  const PRZYCISKI = ['kredyty', 'napisz', 'zaloguj', 'reset', 'email', 'blokada-logowania', 'usuniecie'];

  it('nagłówek i „Operacje wrażliwe”: każde działanie ma w rejestrze trasę API, a trasa istnieje', () => {
    expect(AKCJE.map((a) => a.id)).toEqual(expect.arrayContaining(PRZYCISKI));
    const nieznane = AKCJE.filter((a) => trasa(a.sciezka, a.metoda).length !== 1).map((a) => `${a.id}: ${a.metoda} ${a.sciezka}`);
    expect(nieznane).toEqual([]);
  });

  it.each(ROLE_SYSTEMOWE.map((r) => [r.name, r.permissions] as const))('%s: przycisk aktywny w panelu ⇔ API przepuszcza', async (_rola, uprawnienia) => {
    const rozjazdy: string[] = [];
    for (const a of AKCJE) {
      const panel = spelnia(a.perm, uprawnienia);
      const api = await wpuszcza(trasa(a.sciezka, a.metoda)[0]!, uprawnienia);
      if (panel !== api) rozjazdy.push(`${a.id}: panel ${panel ? 'aktywny' : 'wyszarzony'}, ${a.metoda} ${a.sciezka} ${api ? 'przepuszcza' : '403'}`);
    }
    expect(rozjazdy).toEqual([]);
  });

  it('L1 Konsultant: API odmawia kredytów, wejścia na konto, resetu hasła, zmiany e-maila, blokady i usunięcia; mail serwisowy — tak', async () => {
    const l1 = ROLE_SYSTEMOWE.find((r) => r.name === 'L1 Konsultant')!.permissions;
    const wynik: Record<string, boolean> = {};
    for (const id of PRZYCISKI) {
      const a = AKCJE.find((x) => x.id === id)!;
      wynik[id] = await wpuszcza(trasa(a.sciezka, a.metoda)[0]!, l1);
    }
    expect(wynik).toEqual({ kredyty: false, napisz: true, zaloguj: false, reset: false, email: false, 'blokada-logowania': false, usuniecie: false });
  });
});

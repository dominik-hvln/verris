import { jezykPodstrony, kluczPodstrony } from '../jezyki.ts';
import { Firma, Motyw, Podstrona, Sekcja, type Strona } from '../model.ts';

/**
 * Zmiana całej strony jako lista operacji (paczka 127). Zamiast przepisywać całą stronę (kilka tysięcy tokenów wyjścia
 * przy każdej zmianie) model zwraca `{"operacje":[…]}`, a serwer wykonuje je po kolei na kopii strony. Wynik idzie
 * dalej przez tę samą walidację co dotąd (schemat, spójność, katalogi, zasady treści, wersja kreatora), a błąd
 * operacji (np. nieistniejące id) wraca jako ścieżka `operacje.N…` do jednej rundy naprawy.
 *
 * `podstrona` (slug) w operacjach sekcji i podstron – domyślnie podstrona wskazana przez klienta (bez wskazania:
 * strona główna ""). Opis formatu dla modelu: master prompt, rozdział „Zmiana całej strony – operacje”.
 */

export const OPERACJE_STRONY = ['zmien', 'dodaj', 'usun', 'przesun', 'podstrona', 'dodaj-podstrone', 'usun-podstrone', 'motyw', 'seo', 'firma', 'stopka'] as const;
export type OperacjaStrony = (typeof OPERACJE_STRONY)[number];

/** Więcej operacji niż tyle w jednej odpowiedzi to błąd (ochrona przed odpowiedzią bez końca). */
export const MAKS_OPERACJI = 80;

export type WynikOperacji = { ok: true; strona: Strona } | { ok: false; bledy: string[] };

type Obiekt = Record<string, unknown>;
const obiekt = (v: unknown): v is Obiekt => !!v && typeof v === 'object' && !Array.isArray(v);

/** Czy odpowiedź modelu to lista operacji (a nie pełna Strona albo Sekcja). */
export function czyOperacje(dane: unknown): boolean {
  return Array.isArray(dane) || (obiekt(dane) && Array.isArray(dane.operacje) && !('strony' in dane));
}

function bledyZod(prefiks: string, issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.slice(0, 10).map((i) => `${prefiks}${i.path.length ? `.${i.path.map(String).join('.')}` : ''}: ${i.message}`);
}

/** Scalenie częściowego obiektu (motyw, firma) – zagnieżdżone obiekty (paleta, fonty) też częściowo. */
function scal(baza: Obiekt, zmiana: Obiekt): Obiekt {
  const wynik: Obiekt = { ...baza };
  for (const [k, v] of Object.entries(zmiana)) {
    if (v === undefined) continue;
    wynik[k] = obiekt(v) && obiekt(baza[k]) && k !== 'adres' ? scal(baza[k] as Obiekt, v) : v;
  }
  return wynik;
}

/**
 * Wykonuje operacje na kopii strony. Zwraca stronę po zmianach (jeszcze bez walidacji spójności, katalogów i zasad
 * treści – robi to odczyt) albo listę błędów. Operacja na nieistniejącej sekcji lub podstronie = błąd całości
 * (nic nie jest zapisywane częściowo).
 */
export function zastosujOperacje(strona: Strona, dane: unknown, slugDomyslny = ''): WynikOperacji {
  const lista = Array.isArray(dane) ? dane : obiekt(dane) && Array.isArray(dane.operacje) ? dane.operacje : null;
  if (!lista) return { ok: false, bledy: ['operacje: oczekiwano {"operacje":[…]}'] };
  if (!lista.length) return { ok: false, bledy: ['operacje: pusta lista – zwróć co najmniej jedną operację'] };
  if (lista.length > MAKS_OPERACJI) return { ok: false, bledy: [`operacje: najwyżej ${MAKS_OPERACJI} operacji`] };

  const s = structuredClone(strona);
  const bledy: string[] = [];

  lista.forEach((op: unknown, i) => {
    const sc = `operacje.${i}`;
    if (!obiekt(op) || typeof op.op !== 'string' || !(OPERACJE_STRONY as readonly string[]).includes(op.op)) {
      bledy.push(`${sc}.op: nieznana operacja – dozwolone: ${OPERACJE_STRONY.join(', ')}`);
      return;
    }
    const slug = typeof op.podstrona === 'string' ? op.podstrona : slugDomyslny;
    const podstrona = () => {
      const p = s.strony.find((x) => x.slug === slug);
      if (!p) bledy.push(`${sc}.podstrona: brak podstrony „${slug}”`);
      return p;
    };
    const indeks = (p: Strona['strony'][number], id: unknown, pole: string) => {
      const n = typeof id === 'string' ? p.sekcje.findIndex((x) => x.id === id) : -1;
      if (n < 0) bledy.push(`${sc}.${pole}: brak sekcji o id „${String(id)}” na podstronie „${p.slug}” (są: ${p.sekcje.map((x) => x.id).join(', ')})`);
      return n;
    };
    const sekcja = (wartosc: unknown, id?: string) => {
      const w = Sekcja.safeParse(obiekt(wartosc) ? (id ? { ...wartosc, id } : wartosc) : wartosc);
      if (!w.success) bledy.push(...bledyZod(`${sc}.sekcja`, w.error.issues));
      return w.success ? w.data : null;
    };

    switch (op.op as OperacjaStrony) {
      case 'zmien': {
        const p = podstrona();
        if (!p) return;
        const n = indeks(p, op.id, 'id');
        const nowa = sekcja(op.sekcja, typeof op.id === 'string' ? op.id : undefined);
        if (n >= 0 && nowa) p.sekcje[n] = nowa;
        return;
      }
      case 'dodaj': {
        const p = podstrona();
        if (!p) return;
        const nowa = sekcja(op.sekcja);
        if (!nowa) return;
        if (p.sekcje.some((x) => x.id === nowa.id)) {
          bledy.push(`${sc}.sekcja.id: id „${nowa.id}” jest już zajęte na podstronie „${p.slug}”`);
          return;
        }
        if (op.po === undefined) p.sekcje.push(nowa);
        else if (op.po === null) p.sekcje.unshift(nowa);
        else {
          const n = indeks(p, op.po, 'po');
          if (n >= 0) p.sekcje.splice(n + 1, 0, nowa);
        }
        return;
      }
      case 'usun': {
        const p = podstrona();
        if (!p) return;
        const n = indeks(p, op.id, 'id');
        if (n >= 0) p.sekcje.splice(n, 1);
        return;
      }
      case 'przesun': {
        const p = podstrona();
        if (!p) return;
        const n = indeks(p, op.id, 'id');
        if (n < 0) return;
        if (op.po === op.id) return;
        const [x] = p.sekcje.splice(n, 1);
        if (op.po === null || op.po === undefined) p.sekcje.unshift(x);
        else {
          const m = p.sekcje.findIndex((y) => y.id === op.po);
          if (m < 0) {
            p.sekcje.splice(n, 0, x);
            indeks(p, op.po, 'po');
          } else p.sekcje.splice(m + 1, 0, x);
        }
        return;
      }
      case 'podstrona': {
        const p = podstrona();
        if (!p) return;
        if (typeof op.tytul === 'string') p.tytul = op.tytul;
        if (obiekt(op.seo)) p.seo = scal(p.seo, op.seo) as typeof p.seo;
        return;
      }
      case 'dodaj-podstrone': {
        const w = Podstrona.safeParse(op.strona);
        if (!w.success) {
          bledy.push(...bledyZod(`${sc}.strona`, w.error.issues));
          return;
        }
        if (s.strony.some((x) => x.slug === w.data.slug)) {
          bledy.push(`${sc}.strona.slug: podstrona „${w.data.slug}” już istnieje`);
          return;
        }
        s.strony.push(w.data);
        return;
      }
      case 'usun-podstrone': {
        const p = podstrona();
        if (!p) return;
        if (p.slug === '') {
          bledy.push(`${sc}.podstrona: strony głównej nie można usunąć`);
          return;
        }
        const klucz = kluczPodstrony(s, p);
        const jezyk = jezykPodstrony(s, p);
        if (s.strony.some((x) => x !== p && jezykPodstrony(s, x) !== jezyk && kluczPodstrony(s, x) === klucz)) {
          bledy.push(`${sc}.podstrona: podstrona „${p.slug}” ma wersje językowe – usuwa się je w edytorze`);
          return;
        }
        s.strony = s.strony.filter((x) => x !== p);
        return;
      }
      case 'motyw': {
        if (!obiekt(op.motyw)) {
          bledy.push(`${sc}.motyw: oczekiwano obiektu ze zmienianymi polami motywu`);
          return;
        }
        const w = Motyw.safeParse(scal(s.motyw, op.motyw));
        if (!w.success) bledy.push(...bledyZod(`${sc}.motyw`, w.error.issues));
        else s.motyw = w.data;
        return;
      }
      case 'seo': {
        if (!obiekt(op.seo)) {
          bledy.push(`${sc}.seo: oczekiwano obiektu ze zmienianymi polami SEO`);
          return;
        }
        s.seo = scal(s.seo, op.seo) as Strona['seo'];
        return;
      }
      case 'firma': {
        if (!obiekt(op.firma)) {
          bledy.push(`${sc}.firma: oczekiwano obiektu ze zmienianymi polami firmy`);
          return;
        }
        const w = Firma.safeParse(scal(s.firma, op.firma));
        if (!w.success) bledy.push(...bledyZod(`${sc}.firma`, w.error.issues));
        else s.firma = w.data;
        return;
      }
      case 'stopka': {
        if (!obiekt(op.stopka)) {
          bledy.push(`${sc}.stopka: oczekiwano obiektu {"tekst":…,"znakKreatora":…}`);
          return;
        }
        // Polityka prywatności, regulamin i tłumaczenia stopki należą do panelu – operacja ich nie zmienia.
        const { tekst, znakKreatora } = op.stopka;
        s.stopka = { ...s.stopka, ...(tekst !== undefined ? { tekst: tekst as string } : {}), ...(znakKreatora !== undefined ? { znakKreatora: znakKreatora as Strona['stopka']['znakKreatora'] } : {}) };
        return;
      }
    }
  });

  return bledy.length ? { ok: false, bledy: bledy.slice(0, 40) } : { ok: true, strona: s };
}

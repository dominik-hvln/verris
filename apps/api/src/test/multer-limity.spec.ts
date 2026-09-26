import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAKS_INDEKS_TABLICY_W_POLU,
  opcjeUploaduDoPamieci,
} from '../common/upload/multer-limity.js';

const KORZEN = resolve(import.meta.dirname, '../../../..');

/**
 * SEC-07 — multipart nie kładzie procesu jednym żądaniem.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CZEGO TEN STRAŻNIK PILNUJE I DLACZEGO AKURAT TEGO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Trzy podatności HIGH w multerze 2.2.0 (GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf,
 * GHSA-535w-7cp7-47q4). Wszystkie kończą proces Node jednym żądaniem multipart,
 * bez uwierzytelnienia.
 *
 * Najważniejszy test w tym pliku to ten o LICZBIE KOPII multera w drzewie —
 * i to jest cała historia tej pozycji. PR #37 podnosił multer 2.2.0 → 2.3.0,
 * czyli dokładnie do wersji załatanej, i wyglądał na naprawę. Nie był nią:
 * `@nestjs/platform-express@11.2.1` deklaruje `"multer": "2.2.0"` PINEM
 * DOKŁADNYM, bez karety. Po takim merge w drzewie stanęłyby dwie kopie —
 * 2.3.0 dla `apps/api` i 2.2.0 pod platform-express. Multipart parsuje
 * `FileInterceptor`, który pochodzi z platform-express, czyli z kopii PODATNEJ.
 * Zależność bezpośrednia wyglądałaby na załataną, a dziura zostałaby dokładnie
 * tam, gdzie leci ruch.
 *
 * Dlatego ten strażnik nie pyta „czy podnieśliśmy multera". Pyta „ile kopii
 * multera jest w drzewie i czy KAŻDA jest załatana". Pytanie o wersję
 * bezpośredniej zależności przeszłoby na zepsutym drzewie.
 */
describe('SEC-07 — multipart nie kładzie procesu', () => {
  const lock = readFileSync(resolve(KORZEN, 'pnpm-lock.yaml'), 'utf-8');
  const pkgApi = JSON.parse(readFileSync(resolve(KORZEN, 'apps/api/package.json'), 'utf-8'));

  /** Wszystkie wersje multera, jakie rozwiązał lockfile — z definicji pakietów. */
  const wersjeMultera = [...new Set([...lock.matchAll(/^ {2}multer@([0-9][^:]*):/gm)].map((m) => m[1]))];

  it('w drzewie jest DOKŁADNIE JEDNA kopia multera', () => {
    expect({
      wersje: wersjeMultera,
      podpowiedz:
        wersjeMultera.length === 1
          ? ''
          : 'Druga kopia multera to najprawdopodobniej pin 2.2.0 z @nestjs/platform-express. ' +
            'To ta kopia obsługuje multipart — podniesienie zależności bezpośredniej jej nie dotyka. ' +
            'Napraw przez overrides w pnpm-workspace.yaml, nie przez bump w apps/api.',
    }).toEqual({ wersje: expect.arrayContaining([expect.any(String)]), podpowiedz: '' });
    expect(wersjeMultera).toHaveLength(1);
  });

  it('ta kopia jest w wersji co najmniej 2.3.0', () => {
    const [major, minor] = (wersjeMultera[0] ?? '0.0.0').split('.').map(Number);
    expect({ wersja: wersjeMultera[0], zalatana: major > 2 || (major === 2 && minor >= 3) }).toEqual({
      wersja: wersjeMultera[0],
      zalatana: true,
    });
  });

  it('override w korzeniu istnieje — to on wymusza jedną kopię mimo pinu Nesta', () => {
    // PB-38: od pnpm 11 overrides żyją w pnpm-workspace.yaml (nie w package.json → pnpm).
    const workspace = readFileSync(resolve(KORZEN, 'pnpm-workspace.yaml'), 'utf-8');
    const override = /^overrides:\n(?:[ \t]+.*\n)*?[ \t]+"?multer"?:\s*"([^"]+)"/m.exec(workspace)?.[1];
    expect(override).toBeDefined();
    expect(override).toMatch(/\^?2\.[3-9]|\^?[3-9]/);
  });

  it('opcje uploadu niosą fieldArrayIndexLimit — sama wersja NIE wystarcza', () => {
    // GHSA-535w-7cp7-47q4: „upgrade to 2.3.0 AND configure limits.fieldArrayIndexLimit".
    // Bez tego pola podniesienie wersji zamyka dwie podatności z trzech.
    const opcje = opcjeUploaduDoPamieci(1234) as unknown as {
      limits: { fileSize: number; fieldArrayIndexLimit: number };
    };
    expect(opcje.limits.fieldArrayIndexLimit).toBe(MAKS_INDEKS_TABLICY_W_POLU);
    expect(opcje.limits.fileSize).toBe(1234);
  });

  it('limit jest na tyle mały, żeby zamknąć atak', () => {
    // Atak potrzebuje indeksu rzędu 4 294 967 294 (maksymalna długość tablicy).
    // Każdy limit poniżej kilku tysięcy go zamyka; asercja pilnuje, żeby nikt
    // nie „poluzował" tej liczby do wartości, która przestaje cokolwiek znaczyć.
    expect(MAKS_INDEKS_TABLICY_W_POLU).toBeLessThanOrEqual(1000);
    expect(MAKS_INDEKS_TABLICY_W_POLU).toBeGreaterThanOrEqual(0);
  });

  it('żaden interceptor nie omija wspólnych limitów', () => {
    // Asercja o treści STOI OBOK zachowaniowej, nie zamiast niej (lekcja z X-34):
    // tamta sprawdza, co robi funkcja, ta — że wszyscy z niej korzystają.
    const zrodla = ['apps/api/src/tickets/tickets.controller.ts', 'apps/api/src/files/files.controller.ts'];
    const omijajace = zrodla.filter((p) => {
      const t = readFileSync(resolve(KORZEN, p), 'utf-8');
      return /memoryStorage\(\)/.test(t) || !/opcjeUploaduDoPamieci\(/.test(t);
    });
    expect({
      omijajace,
      podpowiedz:
        omijajace.length === 0
          ? ''
          : 'Interceptor z własnym `storage`/`limits` nie dostanie fieldArrayIndexLimit. ' +
            'Każdy multipart przechodzi przez opcjeUploaduDoPamieci().',
    }).toEqual({ omijajace: [], podpowiedz: '' });
  });

  it('rzutowanie w multer-limity.ts ma termin — przypomni o sobie przy bumpie @types/multer', () => {
    // X-21: deklaracje typów mają opisywać tę wersję biblioteki, która jest
    // zainstalowana. @types/multer 2.2.0 nie zna fieldArrayIndexLimit, a `limits`
    // jest tam typem literalnym, więc nie da się go rozszerzyć deklaracją —
    // stąd jedno rzutowanie. Gdy typy pójdą do przodu, ten test upadnie i każe
    // sprawdzić, czy rzutowanie jest jeszcze potrzebne. Obejście z terminem,
    // nie obejście na zawsze.
    expect({
      typy: pkgApi.devDependencies?.['@types/multer'] ?? pkgApi.dependencies?.['@types/multer'],
      podpowiedz:
        'Jeśli ten test upadł po podniesieniu @types/multer: sprawdź, czy Options.limits zna już ' +
        'fieldArrayIndexLimit. Jeśli tak — usuń rzutowanie z apps/api/src/common/upload/multer-limity.ts ' +
        'i zaktualizuj tę asercję. Jeśli nie — podnieś tylko oczekiwaną wersję.',
    }).toEqual({ typy: '^2.2.0', podpowiedz: expect.any(String) });
  });
});

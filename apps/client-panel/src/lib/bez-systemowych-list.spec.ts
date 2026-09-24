import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Panel klienta nie pokazuje systemowych list wyboru — tylko komponent `Select`
 * (`@/components/panel/select`), spójny z motywem i obsługą klawiatury. Decyzja właściciela
 * 2026-09-24: natywny `<select>` wygląda inaczej w każdej przeglądarce i odstaje od wzorca.
 */
it('żaden plik panelu nie renderuje natywnego <select>', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (n.endsWith('.tsx') && /<select[\s>]/.test(readFileSync(p, 'utf8'))) trafienia.push(p.split('/src/')[1]!);
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});

/**
 * To samo dotyczy okien przeglądarki: `window.confirm` / `prompt` / `alert` wyglądają jak ostrzeżenie systemu,
 * nie pasują do motywu i na telefonie zasłaniają cały ekran. Zamiast nich `potwierdz` / `zapytaj`
 * z `@/components/panel/potwierdz`.
 */
it('żaden plik panelu nie woła systemowych okien confirm / prompt / alert', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (/\.tsx?$/.test(n) && !n.endsWith('.spec.ts')) {
        const kod = readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '');
        if (/(?<![\w.])(?:window\.)?(?:confirm|prompt|alert)\(/.test(kod)) trafienia.push(p.split('/src/')[1]!);
      }
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});

/** Widoczne `<input type="file">` pokazuje systemowe „Choose files / No file chosen” (po angielsku). */
it('żaden plik panelu nie pokazuje systemowego wyboru plików', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (n.endsWith('.tsx')) {
        const pola = readFileSync(p, 'utf8').match(/<input\b[^>]*?type=["']file["'][^>]*>/gs) ?? [];
        if (pola.some((t) => !/\bhidden\b|sr-only/.test(t))) trafienia.push(p.split('/src/')[1]!);
      }
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});

/**
 * Zasada PB-16 „nic się nie chowa”: bez wielokropka w treści (truncate, line-clamp) i bez list
 * przewijanych w bok z ukrytym paskiem — to, czego klient nie widzi, dla niego nie istnieje.
 */
it('żaden plik panelu nie ucina treści ani nie chowa jej za ukrytym przewijaniem', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (n.endsWith('.tsx') && /(?<![\w-])(?:truncate|line-clamp-\d|scrollbar-none|no-scrollbar)(?![\w-])|\[scrollbar-width:none\]/.test(readFileSync(p, 'utf8'))) {
        trafienia.push(p.split('/src/')[1]!);
      }
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});

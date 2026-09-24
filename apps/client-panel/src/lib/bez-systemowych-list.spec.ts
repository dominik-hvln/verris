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

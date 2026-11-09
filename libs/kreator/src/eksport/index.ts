import { ZAKRESY_FONTOW, plikFontu, ustawFonty, type ZakresFontu } from '../render/fonty.ts';
import type { Strona } from '../model.ts';
import { dopasujDoPlanu } from '../plany.ts';
import type { CelCms, EksportCms, OpcjeEksportu, OpisCeluCms } from './model.ts';
import { eksportujWordpress } from './wordpress/index.ts';

/**
 * Eksport strony z Verris Kreatora do CMS-a (paczka 124, etap 3 koncepcji). Interfejs celu: kolejny CMS to nowy
 * wpis w CELE_EKSPORTU (funkcja `eksportuj` + opis dla panelu) – API i panel biorą listę stąd.
 */
export * from './model.ts';
export { parsujBloki, splaszcz, type BlokOdczytany } from './wordpress/bloki.ts';
export { przestrzenNazwCss, prefiksKlas } from './css.ts';
export { TOKEN_MEDIUM, TOKEN_STRONY } from './wordpress/konwerter.ts';
export { KATALOG_MOTYWU, FUNCTIONS_PHP } from './wordpress/motyw.ts';

export interface CelEksportu {
  opis: OpisCeluCms;
  eksportuj: (strona: Strona, opcje: OpcjeEksportu) => EksportCms;
}

export const CELE_EKSPORTU: Record<CelCms, CelEksportu> = {
  wordpress: {
    opis: {
      id: 'wordpress',
      nazwa: 'WordPress',
      opis: 'Strona przechodzi na WordPressa na Twoim hostingu: te same sekcje jako bloki edytora WordPressa, motyw z kolorami i fontami Twojej strony.',
      kiedyWarto: [
        'blog, w którym pisze kilka osób (konta autorów i redaktorów)',
        'potrzebujesz wtyczek WordPressa (rezerwacje, newsletter, integracje)',
        'chcesz sklep internetowy na WooCommerce',
      ],
      coSieZmienia: [
        'stronę edytujesz w panelu WordPressa, nie w kreatorze',
        'kreator przestaje publikować na tę domenę (projekt w kreatorze zostaje)',
        'aktualizacje WordPressa, motywu i wtyczek są po Twojej stronie (pomagają w tym narzędzia WordPressa w panelu)',
      ],
    },
    eksportuj: eksportujWordpress,
  },
};

/** Lista celów dla panelu (karta „Przejdź na CMS”). */
export function celeCms(): OpisCeluCms[] {
  return Object.values(CELE_EKSPORTU).map((c) => c.opis);
}

/**
 * Cała strona (wszystkie wersje językowe) w neutralnej strukturze celu. Strona dopasowana do wersji kreatora
 * przez dopasujDoPlanu – w eksporcie nie ma elementów Pro, których klient nie ma.
 */
export function eksportujDoCms(strona: Strona, cel: CelCms, opcje: OpcjeEksportu): EksportCms {
  const c = CELE_EKSPORTU[cel];
  if (!c) throw new Error(`Nieznany cel eksportu: ${String(cel)}`);
  return c.eksportuj(strona, opcje);
}

/** Pliki fontów potrzebne motywowi (przed eksportem – API sprawdza, których krojów proxy nie ma w danym zakresie). */
export function fontyEksportu(strona: Strona, opcje: Pick<OpcjeEksportu, 'wersja'>): string[] {
  const s = dopasujDoPlanu(strona, opcje.wersja).strona;
  const wynik: string[] = [];
  for (const f of ustawFonty(s.motyw).potrzebne) {
    for (const w of f.wagi) {
      for (const k of f.kursywa ? [false, true] : [false]) {
        for (const z of Object.keys(ZAKRESY_FONTOW) as ZakresFontu[]) wynik.push(plikFontu(f.rodzina, w, k, z));
      }
    }
  }
  return wynik;
}

import type { Strona } from '../../model.ts';
import { budujKolory } from '../../render/paleta.ts';
import { plikFontu, slugRodziny, stosFontu, ustawFonty, ZAKRESY_FONTOW, type ZakresFontu } from '../../render/fonty.ts';
import { budujSkrypt } from '../../render/skrypt.ts';
import { przestrzenNazwCss } from '../css.ts';
import type { PlikCms } from '../model.ts';
import { blok } from './bloki.ts';

/**
 * Motyw blokowy „Verris Kreator” generowany ze strony (paczka 124): style.css, theme.json v3, szablony, części
 * nagłówka i stopki, functions.php (tylko odczyt ustawień z JSON-a motywu – bez danych klienta w kodzie PHP,
 * bez wywołań zewnętrznych), arkusz sekcji z renderera (przestrzeń nazw `vk-`) i arkusz zgodności z blokami.
 * Pliki fontów (te same woff2 latin/latin-ext co publikacja) dokłada API do assets/fonts.
 * Dokumentacja motywów blokowych: https://developer.wordpress.org/themes/global-settings-and-styles/ (theme.json v3,
 * WordPress 6.6+) – do sprawdzenia z dokumentacją przy wdrożeniu.
 */
export const KATALOG_MOTYWU = 'verris-kreator';
export const SZABLON_STRONY = 'strona-kreatora';

export interface WejscieMotywu {
  strona: Strona;
  /** assets/styl.css z renderera. */
  css: string;
  /** Bloki części: nagłówek, stopka, treść strony 404. */
  naglowek: string;
  stopka: string;
  tresc404: string;
  /** Klasy z <html> renderera (styl, wyróżnienia, efekty) – dostaje je <body>. */
  klasyBody: string[];
  /** Dane strukturalne firmy i witryny (bez adresów – dopisuje je motyw z home_url). */
  jsonLd: unknown;
  /** Czy w treści jest formularz kontaktowy (skrypt komunikatu po wysyłce). */
  formularz: boolean;
  brakujaceFonty: Set<string>;
  data: Date;
}

/** Wersja motywu = data generacji (WordPress pokazuje ją w Wyglądzie; pliki CSS dostają ją jako ?ver=). */
function wersja(d: Date): string {
  return `1.0.${d.toISOString().slice(0, 16).replace(/\D/g, '')}`;
}

function styleCss(d: Date): string {
  return `/*
Theme Name: Verris Kreator
Theme URI: https://verris.pl/kreator
Author: Verris
Author URI: https://verris.pl
Description: Motyw blokowy wygenerowany przez Verris Kreator ze strony klienta. Wygląd sekcji w assets/css/sekcje.css, kolory i fonty w theme.json.
Version: ${wersja(d)}
Requires at least: 6.6
Tested up to: 6.8
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Text Domain: verris-kreator
*/
`;
}

const NAZWY_KOLOROW: [keyof ReturnType<typeof budujKolory>['paleta'], string, string][] = [
  ['tlo', 'tlo', 'Tło'],
  ['powierzchnia', 'powierzchnia', 'Powierzchnia'],
  ['tekst', 'tekst', 'Tekst'],
  ['tekstPrzygaszony', 'tekst-przygaszony', 'Tekst przygaszony'],
  ['akcent', 'akcent', 'Akcent'],
  ['naAkcencie', 'na-akcencie', 'Tekst na akcencie'],
  ['akcentTekst', 'akcent-tekst', 'Akcent w tekście'],
  ['linia', 'linia', 'Linia'],
  ['ciemne', 'ciemne', 'Ciemne tło'],
  ['naCiemnym', 'na-ciemnym', 'Tekst na ciemnym'],
];

/** Nazwa rodziny bez znaków spoza liter, cyfr, spacji i myślnika (jak w arkuszu renderera). */
const nazwaRodziny = (r: string) => r.replace(/[^\p{L}\p{N} -]/gu, '').trim();

export function themeJson(w: Pick<WejscieMotywu, 'strona' | 'brakujaceFonty'>): { json: Record<string, unknown>; fonty: string[] } {
  const s = w.strona;
  const kolory = budujKolory(s.motyw.paleta).paleta;
  const f = ustawFonty(s.motyw);
  const fonty: string[] = [];
  const rodziny = f.potrzebne.map((font) => {
    const fontFace: Record<string, unknown>[] = [];
    for (const waga of font.wagi) {
      for (const kursywa of font.kursywa ? [false, true] : [false]) {
        for (const zakres of Object.keys(ZAKRESY_FONTOW) as ZakresFontu[]) {
          const plik = plikFontu(font.rodzina, waga, kursywa, zakres);
          if (w.brakujaceFonty.has(plik)) continue;
          fonty.push(plik);
          fontFace.push({
            fontFamily: nazwaRodziny(font.rodzina),
            fontStyle: kursywa ? 'italic' : 'normal',
            fontWeight: String(waga),
            fontDisplay: 'swap',
            src: [`file:./assets/fonts/${plik}`],
            unicodeRange: ZAKRESY_FONTOW[zakres],
          });
        }
      }
    }
    return { name: nazwaRodziny(font.rodzina), slug: slugRodziny(font.rodzina), fontFamily: stosFontu(font.rodzina), fontFace };
  });
  const preset = (rodzina: string) => `var(--wp--preset--font-family--${slugRodziny(rodzina)})`;
  const json = {
    $schema: 'https://schemas.wp.org/wp/6.6/theme.json',
    version: 3,
    settings: {
      appearanceTools: true,
      useRootPaddingAwareAlignments: false,
      color: {
        defaultPalette: false,
        defaultGradients: false,
        defaultDuotone: false,
        palette: NAZWY_KOLOROW.map(([klucz, slug, name]) => ({ slug, name, color: kolory[klucz] })),
      },
      typography: {
        defaultFontSizes: false,
        fluid: false,
        fontFamilies: rodziny,
        fontSizes: [
          { slug: 'maly', name: 'Mały', size: '0.875rem' },
          { slug: 'normalny', name: 'Normalny', size: '1rem' },
          { slug: 'wstep', name: 'Wstęp', size: 'var(--fs-lead)' },
          { slug: 'h3', name: 'Nagłówek 3', size: 'var(--fs-h3)' },
          { slug: 'h2', name: 'Nagłówek 2', size: 'var(--fs-h2)' },
          { slug: 'h1', name: 'Nagłówek 1', size: 'var(--fs-h1)' },
        ],
      },
      spacing: {
        // null = bez odstępów „blockGap” między blokami – odstępy daje arkusz sekcji (jak na stronie statycznej).
        blockGap: null,
        defaultSpacingSizes: false,
        spacingSizes: [
          { slug: '20', name: 'Mały', size: '0.75rem' },
          { slug: '40', name: 'Średni', size: '1.5rem' },
          { slug: '60', name: 'Odstęp sekcji', size: 'var(--odstep)' },
          { slug: '80', name: 'Margines sekcji', size: 'var(--sek-py)' },
        ],
        units: ['px', 'em', 'rem', '%', 'vh', 'vw'],
      },
      layout: { contentSize: '50rem', wideSize: '72rem' },
    },
    styles: {
      color: { background: 'var(--wp--preset--color--tlo)', text: 'var(--wp--preset--color--tekst)' },
      typography: { fontFamily: preset(s.motyw.fonty.tekst), fontSize: '1rem', lineHeight: '1.6' },
      spacing: { padding: { top: '0', right: '0', bottom: '0', left: '0' } },
      elements: {
        heading: { typography: { fontFamily: preset(s.motyw.fonty.naglowki), fontWeight: String(f.wagaNaglowka), lineHeight: '1.1' } },
        link: { color: { text: 'currentColor' } },
        button: {
          color: { background: 'var(--wp--preset--color--akcent)', text: 'var(--wp--preset--color--na-akcencie)' },
          typography: { fontFamily: preset(s.motyw.fonty.tekst), fontWeight: String(f.wagaPogrubiona) },
        },
      },
    },
    templateParts: [
      { name: 'header', title: 'Nagłówek', area: 'header' },
      { name: 'footer', title: 'Stopka', area: 'footer' },
    ],
    customTemplates: [{ name: SZABLON_STRONY, title: 'Strona z Verris Kreatora (bez tytułu nad treścią)', postTypes: ['page', 'post'] }],
  };
  return { json, fonty };
}

/**
 * Zgodność bloków WordPressa z arkuszem sekcji: opakowania bloków (przycisk, obraz, galeria, kolumny, szczegóły,
 * nawigacja, części szablonu) zachowują się jak elementy strony statycznej.
 */
export const ARKUSZ_ZGODNOSCI = `/* Verris Kreator – zgodność bloków WordPressa z wyglądem strony z kreatora.
   Ten arkusz ładuje się po sekcje.css: reguły ogólne mają zerową specyficzność (:where), żeby nie nadpisywać sekcji. */
.wp-site-blocks{padding:0}
.wp-site-blocks>*{margin-block:0}
:where(.vk) :where(.wp-block-group,.wp-block-buttons,.wp-block-button,.wp-block-columns,.wp-block-column,.wp-block-image,.wp-block-gallery,.wp-block-quote,.wp-block-details,.wp-block-list,figure){margin:0}
:where(.vk) :where(.wp-block-group){box-sizing:border-box}
/* przyciski: opakowanie bez własnego wyglądu, wygląd na linku (sekcje.css: .wp-block-button.vk-btn>…) */
:where(.vk) :where(.wp-block-buttons){display:flex;flex-wrap:wrap;gap:.75rem}
.wp-block-button.vk-btn{display:inline-flex}
.wp-block-button.vk-btn>.wp-block-button__link{box-sizing:border-box;flex:1}
.wp-block-button.vk-btn-pelny{display:flex;width:100%}
.vk-pasek-cta>.wp-block-button{flex:1}
/* układ flex bloku przycisków (body .is-layout-flex) jest mocniejszy niż ukrycie paska na komputerze w sekcje.css */
@media (min-width:960px){.wp-block-buttons.vk-pasek-cta{display:none}}
/* obrazy w ramkach .vk-ob */
.wp-block-image.vk-ob img{width:100%;height:100%;object-fit:cover;display:block}
.wp-block-image.vk-ob figcaption{position:absolute;right:0;bottom:0;margin:0;padding:2px 6px;font-size:11px;line-height:1.3;background:rgba(0,0,0,.55);color:#fff}
/* galeria: siatka z arkusza sekcji zamiast układu galerii WordPressa */
.vk .wp-block-gallery.has-nested-images{display:grid;flex-wrap:initial}
.vk .wp-block-gallery.has-nested-images figure.wp-block-image:not(#vk){width:auto!important;max-width:none!important;margin:0!important;flex:none!important}
.vk .wp-block-gallery.has-nested-images figure.wp-block-image:not(#vk) img{height:100%;width:100%;object-fit:cover}
/* kolumny cennika: siatka z arkusza sekcji */
.vk .wp-block-columns.vke-ul{display:grid;flex-wrap:initial}
.vk .wp-block-columns.vke-ul>.wp-block-column{flex:none;width:auto}
/* FAQ (core/details): pytanie w <summary> wygląda jak nagłówek pytania, znak +/− */
.wp-block-details.vk-faq-el>summary{display:flex;justify-content:space-between;align-items:center;gap:1.5rem;padding-block:1.35rem;cursor:pointer;list-style:none;font-family:var(--f-nag);font-weight:var(--w-nag);letter-spacing:var(--ls-nag);font-size:clamp(1.0625rem,1rem + .3vw,1.25rem);line-height:1.35}
.wp-block-details.vk-faq-el>summary::-webkit-details-marker{display:none}
.wp-block-details.vk-faq-el>summary::after{content:"+";flex:none;font-family:var(--f-tekst);font-size:1.5rem;line-height:1;font-weight:400}
.wp-block-details.vk-faq-el[open]>summary::after{content:"\\2212"}
/* cytat i listy z bloków */
:where(.vk) :where(.wp-block-quote){border:0;padding:0}
:where(.vk) :where(.wp-block-list){padding:0;list-style:none}
/* nagłówek: część szablonu przyklejona do góry, nawigacja z bloku nawigacji */
.wp-block-template-part:has(>.vk-przyklejony){position:sticky;top:0;z-index:50}
.vk-logo-blok{margin-right:auto}
.vk-logo-blok a{text-decoration:none}
.vk-nawigacja{font-size:.9375rem;font-weight:500}
.vk-nawigacja .wp-block-navigation__container{gap:clamp(1.25rem,2.5vw,2.25rem)}
.vk-nawigacja a{text-decoration:none}
.vk-nawigacja a:hover,.vk-nawigacja .current-menu-item>a{text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:.45em}
.vk-nawigacja .wp-block-navigation__responsive-container.is-menu-open{background:var(--s-tlo);color:var(--s-tekst)}
@media (min-width:960px){.vk-logo-blok{margin-right:0}.vk-nawigacja{margin-inline:auto}}
/* treść dopisana w WordPressie (strony i wpisy bez sekcji kreatora) */
.vk-tresc-wp{padding:clamp(2rem,1rem + 3vw,4rem) var(--kont-px)}
.vk-tresc-wp>*{max-width:50rem;margin-inline:auto}
.vk-tresc-wp>*+*{margin-top:1.25rem}
.vk-wpisy{padding:clamp(2rem,1rem + 3vw,4rem) var(--kont-px);max-width:calc(50rem + 2 * var(--kont-px));margin-inline:auto}
.vk-wpisy .wp-block-post{margin-bottom:2.5rem}
`;

/**
 * functions.php: arkusze i skrypt motywu, klasy <body>, opis strony (meta description z `_verris_opis`), tytuł z
 * `_verris_tytul`, język strony z `_verris_jezyk`, hreflang wersji językowych (`_verris_grupa`), dane strukturalne
 * firmy z assets/ustawienia.json i adresy stron w częściach motywu (tokeny verris-kreator://strona/…).
 * Wszystkie dane klienta są w JSON-ie i meta wpisów – w kodzie PHP nie ma ani jednego znaku z modelu strony.
 */
export const FUNCTIONS_PHP = `<?php
/**
 * Verris Kreator – motyw blokowy wygenerowany ze strony z Verris Kreatora.
 * Bez wywołań zewnętrznych i bez wtyczek: wygląd z theme.json i assets/css, dane strony z assets/ustawienia.json.
 *
 * @package verris-kreator
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Ustawienia motywu z assets/ustawienia.json (klasy body, dane strukturalne firmy). */
function verris_kreator_ustawienia() {
	static $dane = null;
	if ( null === $dane ) {
		$plik = get_theme_file_path( 'assets/ustawienia.json' );
		$dane = is_readable( $plik ) ? json_decode( (string) file_get_contents( $plik ), true ) : array();
		if ( ! is_array( $dane ) ) {
			$dane = array();
		}
	}
	return $dane;
}

// Style bloków w <head> przed arkuszem sekcji (bez ładowania ich osobno przy pierwszym użyciu bloku w treści) –
// inaczej reguły bloków z tą samą specyficznością co sekcje nadpisywałyby wygląd strony z kreatora.
add_filter( 'should_load_separate_core_block_assets', '__return_false' );

add_action(
	'after_setup_theme',
	function () {
		add_theme_support( 'editor-styles' );
		add_theme_support( 'responsive-embeds' );
		add_editor_style( array( 'assets/css/sekcje.css', 'assets/css/wordpress.css' ) );
	}
);

add_action(
	'wp_enqueue_scripts',
	function () {
		$wersja = wp_get_theme()->get( 'Version' );
		wp_enqueue_style( 'verris-kreator-sekcje', get_theme_file_uri( 'assets/css/sekcje.css' ), array(), $wersja );
		wp_enqueue_style( 'verris-kreator-wordpress', get_theme_file_uri( 'assets/css/wordpress.css' ), array( 'verris-kreator-sekcje' ), $wersja );
		if ( is_readable( get_theme_file_path( 'assets/js/kreator.js' ) ) ) {
			wp_enqueue_script( 'verris-kreator', get_theme_file_uri( 'assets/js/kreator.js' ), array(), $wersja, array( 'in_footer' => true, 'strategy' => 'defer' ) );
		}
	}
);

add_filter(
	'body_class',
	function ( $klasy ) {
		$dane = verris_kreator_ustawienia();
		foreach ( (array) ( $dane['klasyBody'] ?? array() ) as $klasa ) {
			if ( is_string( $klasa ) && preg_match( '/^[a-z0-9-]{1,60}$/', $klasa ) ) {
				$klasy[] = $klasa;
			}
		}
		return $klasy;
	}
);

/** Adres strony z eksportu po kluczu (meta _verris_klucz); strona główna = adres witryny. */
function verris_kreator_adres( $klucz ) {
	static $adresy = array();
	if ( isset( $adresy[ $klucz ] ) ) {
		return $adresy[ $klucz ];
	}
	$adres = home_url( '/' );
	if ( 'glowna' !== $klucz ) {
		$id = get_posts(
			array(
				'post_type'      => array( 'page', 'post' ),
				'post_status'    => 'publish',
				'meta_key'       => '_verris_klucz', // phpcs:ignore WordPress.DB.SlowDBQuery
				'meta_value'     => $klucz, // phpcs:ignore WordPress.DB.SlowDBQuery
				'posts_per_page' => 1,
				'fields'         => 'ids',
			)
		);
		if ( $id ) {
			$adres = get_permalink( $id[0] );
		}
	}
	$adresy[ $klucz ] = $adres;
	return $adres;
}

/** Części motywu (nagłówek, stopka, 404) wskazują strony tokenem – adres z bieżącej instalacji. */
add_filter(
	'render_block',
	function ( $html ) {
		if ( false === strpos( $html, 'verris-kreator://strona/' ) ) {
			return $html;
		}
		return preg_replace_callback(
			'#verris-kreator://strona/([a-z0-9_-]*)#',
			function ( $m ) {
				return esc_url( verris_kreator_adres( $m[1] ) );
			},
			$html
		);
	}
);

add_filter(
	'pre_get_document_title',
	function ( $tytul ) {
		if ( is_singular() ) {
			$wlasny = (string) get_post_meta( get_queried_object_id(), '_verris_tytul', true );
			if ( '' !== $wlasny ) {
				return $wlasny;
			}
		}
		return $tytul;
	}
);

add_filter(
	'language_attributes',
	function ( $atrybuty ) {
		if ( is_singular() ) {
			$jezyk = (string) get_post_meta( get_queried_object_id(), '_verris_jezyk', true );
			if ( preg_match( '/^[a-z]{2}$/', $jezyk ) ) {
				$atrybuty = preg_replace( '/lang="[^"]*"/', 'lang="' . esc_attr( $jezyk ) . '"', $atrybuty );
			}
		}
		return $atrybuty;
	}
);

add_action(
	'wp_head',
	function () {
		$opis = '';
		if ( is_singular() ) {
			$opis = (string) get_post_meta( get_queried_object_id(), '_verris_opis', true );
		}
		if ( '' === $opis && ( is_front_page() || is_home() ) ) {
			$opis = (string) get_bloginfo( 'description' );
		}
		if ( '' !== $opis ) {
			echo '<meta name="description" content="' . esc_attr( $opis ) . '">' . "\\n";
		}

		// Wersje językowe tej samej treści (meta _verris_grupa) – link rel="alternate" hreflang.
		if ( is_singular() ) {
			$grupa = (string) get_post_meta( get_queried_object_id(), '_verris_grupa', true );
			if ( '' !== $grupa ) {
				$wersje = get_posts(
					array(
						'post_type'      => array( 'page', 'post' ),
						'post_status'    => 'publish',
						'meta_key'       => '_verris_grupa', // phpcs:ignore WordPress.DB.SlowDBQuery
						'meta_value'     => $grupa, // phpcs:ignore WordPress.DB.SlowDBQuery
						'posts_per_page' => 10,
						'fields'         => 'ids',
					)
				);
				if ( count( $wersje ) > 1 ) {
					foreach ( $wersje as $id ) {
						$jezyk = (string) get_post_meta( $id, '_verris_jezyk', true );
						if ( preg_match( '/^[a-z]{2}$/', $jezyk ) ) {
							echo '<link rel="alternate" hreflang="' . esc_attr( $jezyk ) . '" href="' . esc_url( get_permalink( $id ) ) . '">' . "\\n";
						}
					}
				}
			}
		}

		$dane = verris_kreator_ustawienia();
		if ( ! empty( $dane['jsonLd'] ) && is_array( $dane['jsonLd'] ) ) {
			$ld   = $dane['jsonLd'];
			$dom  = home_url( '/' );
			$graf = array();
			foreach ( (array) ( $ld['@graph'] ?? array() ) as $wezel ) {
				if ( ! is_array( $wezel ) ) {
					continue;
				}
				foreach ( array( '@id', 'url' ) as $pole ) {
					if ( isset( $wezel[ $pole ] ) && is_string( $wezel[ $pole ] ) ) {
						$wezel[ $pole ] = $dom . ltrim( $wezel[ $pole ], '/' );
					}
				}
				if ( ! isset( $wezel['url'] ) ) {
					$wezel['url'] = $dom;
				}
				if ( isset( $wezel['publisher']['@id'] ) && is_string( $wezel['publisher']['@id'] ) ) {
					$wezel['publisher']['@id'] = $dom . ltrim( $wezel['publisher']['@id'], '/' );
				}
				$graf[] = $wezel;
			}
			$ld['@graph'] = $graf;
			echo '<script type="application/ld+json">' . wp_json_encode( $ld, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\\n";
		}
	},
	1
);
`;

const czesc = (slug: 'header' | 'footer') => blok('template-part', { slug, tagName: 'div', area: slug }, null);
const tresc = blok('post-content', { tagName: 'div', layout: { type: 'default' } }, null);
const main = (wnetrze: string, klasa = 'vk-main') => blok('group', { tagName: 'main', anchor: 'tresc', className: klasa }, `<main class="wp-block-group ${klasa}" id="tresc">${wnetrze}</main>`);
const szablon = (srodek: string) => `${czesc('header')}\n\n${srodek}\n\n${czesc('footer')}\n`;

/** Szablon stron z kreatora: treść ma własny nagłówek strony (hero albo nagłówek podstrony). */
const SZABLON_KREATORA = szablon(main(tresc));
/** Strony i wpisy dopisane w WordPressie: tytuł nad treścią, treść w kolumnie o czytelnej szerokości. */
const SZABLON_STRONY_WP = szablon(
  main(
    blok(
      'group',
      { tagName: 'header', className: 'vk vk-naglowek-strony' },
      `<header class="wp-block-group vk vk-naglowek-strony">${blok('group', { className: 'vk-kontener vk-kontener-waski' }, `<div class="wp-block-group vk-kontener vk-kontener-waski">${blok('post-title', { level: 1 }, null)}</div>`)}</header>`,
    ) +
      '\n' +
      blok('group', { className: 'vk-tresc-wp', layout: { type: 'default' } }, `<div class="wp-block-group vk-tresc-wp">${tresc}</div>`),
  ),
);
const SZABLON_WPISU = szablon(
  main(
    blok(
      'group',
      { tagName: 'header', className: 'vk vk-naglowek-strony' },
      `<header class="wp-block-group vk vk-naglowek-strony">${blok(
        'group',
        { className: 'vk-kontener vk-kontener-waski' },
        `<div class="wp-block-group vk-kontener vk-kontener-waski">${blok('post-date', { className: 'vk-wpis-meta' }, null)}${blok('post-title', { level: 1 }, null)}</div>`,
      )}</header>`,
    ) +
      '\n' +
      blok('group', { className: 'vk-tresc-wp', layout: { type: 'default' } }, `<div class="wp-block-group vk-tresc-wp">${tresc}</div>`),
  ),
);
const SZABLON_LISTY = szablon(
  main(
    blok(
      'query',
      { queryId: 1, query: { perPage: 10, pages: 0, offset: 0, postType: 'post', order: 'desc', orderBy: 'date', inherit: true } },
      `<div class="wp-block-query">${blok(
        'post-template',
        {},
        `${blok('post-date', { className: 'vk-wpis-meta' }, null)}\n${blok('post-title', { isLink: true, level: 2 }, null)}\n${blok('post-excerpt', {}, null)}`,
      )}\n${blok('query-pagination', {}, `${blok('query-pagination-previous', {}, null)}${blok('query-pagination-numbers', {}, null)}${blok('query-pagination-next', {}, null)}`)}</div>`,
    ),
    'vk-main vk-wpisy',
  ),
);

/** Skrypt formularza (adres powrotu, czas wypełnienia, komunikat po wysyłce) z modułu renderera, klasy z prefiksem. */
export function skryptFormularza(): string {
  const js = budujSkrypt(new Set(['formularz']));
  if (!js) throw new Error('Brak modułu formularza w skrypcie renderera');
  return js
    .replace("h.classList.add('js');", '')
    .replace(/'form-ok'/g, "'vk-form-ok'")
    .replace(/'form-blad'/g, "'vk-form-blad'")
    .replace(/\.form-status/g, '.vk-form-status');
}

export function plikiMotywu(w: WejscieMotywu): { pliki: PlikCms[]; fonty: string[] } {
  const { json, fonty } = themeJson(w);
  const ustawienia = { klasyBody: w.klasyBody, jsonLd: w.jsonLd };
  const pliki: PlikCms[] = [
    { sciezka: 'style.css', tresc: styleCss(w.data) },
    { sciezka: 'theme.json', tresc: `${JSON.stringify(json, null, 2)}\n` },
    { sciezka: 'functions.php', tresc: FUNCTIONS_PHP },
    { sciezka: 'templates/index.html', tresc: SZABLON_LISTY },
    { sciezka: 'templates/home.html', tresc: SZABLON_LISTY },
    { sciezka: 'templates/front-page.html', tresc: SZABLON_KREATORA },
    { sciezka: `templates/${SZABLON_STRONY}.html`, tresc: SZABLON_KREATORA },
    { sciezka: 'templates/page.html', tresc: SZABLON_STRONY_WP },
    { sciezka: 'templates/single.html', tresc: SZABLON_WPISU },
    { sciezka: 'templates/404.html', tresc: szablon(main(w.tresc404)) },
    { sciezka: 'parts/header.html', tresc: `${w.naglowek}\n` },
    { sciezka: 'parts/footer.html', tresc: `${w.stopka}\n` },
    { sciezka: 'assets/css/sekcje.css', tresc: `/* Verris Kreator – wygląd sekcji (arkusz strony z kreatora, klasy z prefiksem vk-) */\n${przestrzenNazwCss(w.css)}` },
    { sciezka: 'assets/css/wordpress.css', tresc: ARKUSZ_ZGODNOSCI },
    // <, > i & jako \\u003c… – plik jest publiczny w katalogu motywu; JSON.parse daje te same dane.
    { sciezka: 'assets/ustawienia.json', tresc: `${JSON.stringify(ustawienia, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}\n` },
    { sciezka: 'readme.txt', tresc: README_MOTYWU },
  ];
  if (w.formularz) pliki.push({ sciezka: 'assets/js/kreator.js', tresc: skryptFormularza() });
  return { pliki, fonty };
}

const README_MOTYWU = `=== Verris Kreator ===
Requires at least: 6.6
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Motyw blokowy wygenerowany przez Verris Kreator przy przejściu strony na WordPressa.

== Opis ==
Sekcje strony to zwykłe bloki WordPressa (grupy, nagłówki, akapity, przyciski, obrazy, szczegóły). Wygląd sekcji
pochodzi z arkusza assets/css/sekcje.css (klasy z prefiksem vk-), kolory i fonty z theme.json – zmienisz je
w Wygląd > Edytor > Style. Formularz kontaktowy wysyła wiadomości przez Verris (adres formularza w bloku HTML).
Motyw nie łączy się z żadną usługą zewnętrzną; fonty są w assets/fonts.
`;

<?php
/**
 * Verris Kreator – import paczki strony do WordPressa (paczka 124).
 *
 * Uruchamia go node-kreator-wp.sh przez wp-cli jako użytkownik konta hostingu:
 *   wp eval-file kreator-wp-import.php <paczka.zip> --user=<administrator>
 * (eval-file: https://developer.wordpress.org/cli/commands/eval-file/ – do sprawdzenia z dokumentacją przy wdrożeniu).
 *
 * Paczka (ZIP z API): tresc.json (neutralny model eksportu – libs/kreator/src/eksport/model.ts), motyw/ (motyw blokowy
 * „Verris Kreator”), media/ (zdjęcia z biblioteki strony). Import: motyw → media → strony i wpisy (dwa przebiegi: najpierw
 * identyfikatory, potem treść z podmienionymi tokenami verris-kreator://…) → strona główna → menu → opcje witryny.
 *
 * @package verris-kreator
 */

if ( ! defined( 'ABSPATH' ) || ! class_exists( 'WP_CLI' ) ) {
	exit( 1 );
}

$verris_zip = isset( $args[0] ) ? (string) $args[0] : '';
if ( '' === $verris_zip || ! is_file( $verris_zip ) ) {
	WP_CLI::error( 'Brak paczki importu.' );
}

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

// Treść sekcji to bloki z formularzem i ikonami SVG (bloki HTML) – zapis bez filtrów KSES, jak przez administratora.
kses_remove_filters();

if ( ! WP_Filesystem() ) {
	WP_CLI::error( 'Brak dostępu do plików WordPressa.' );
}
global $wp_filesystem;

$verris_tmp = dirname( $verris_zip ) . '/rozpakowane-' . wp_generate_password( 8, false, false );
$verris_wynik = unzip_file( $verris_zip, $verris_tmp );
if ( is_wp_error( $verris_wynik ) ) {
	WP_CLI::error( 'Nie udało się rozpakować paczki: ' . $verris_wynik->get_error_message() );
}

/** Sprząta katalog roboczy także po błędzie. */
function verris_kwp_sprzatnij( $katalog ) {
	global $wp_filesystem;
	if ( $katalog && $wp_filesystem->is_dir( $katalog ) ) {
		$wp_filesystem->delete( $katalog, true );
	}
}

$verris_dane = json_decode( (string) file_get_contents( $verris_tmp . '/tresc.json' ), true );
if ( ! is_array( $verris_dane ) || 1 !== ( $verris_dane['wersjaFormatu'] ?? null ) || 'wordpress' !== ( $verris_dane['cel'] ?? null ) ) {
	verris_kwp_sprzatnij( $verris_tmp );
	WP_CLI::error( 'Nieznany format paczki.' );
}

// --- Motyw --------------------------------------------------------------------------------------------------------
$verris_katalog = (string) ( $verris_dane['motyw']['katalog'] ?? '' );
if ( ! preg_match( '/^[a-z0-9-]{1,40}$/', $verris_katalog ) ) {
	verris_kwp_sprzatnij( $verris_tmp );
	WP_CLI::error( 'Nieprawidłowa nazwa motywu.' );
}
$verris_cel_motywu = trailingslashit( get_theme_root() ) . $verris_katalog;
if ( $wp_filesystem->is_dir( $verris_cel_motywu ) ) {
	$wp_filesystem->delete( $verris_cel_motywu, true );
}
wp_mkdir_p( $verris_cel_motywu );
$verris_kopia = copy_dir( $verris_tmp . '/motyw', $verris_cel_motywu );
if ( is_wp_error( $verris_kopia ) ) {
	verris_kwp_sprzatnij( $verris_tmp );
	WP_CLI::error( 'Nie udało się zainstalować motywu: ' . $verris_kopia->get_error_message() );
}
switch_theme( $verris_katalog );
if ( get_stylesheet() !== $verris_katalog ) {
	verris_kwp_sprzatnij( $verris_tmp );
	WP_CLI::error( 'Nie udało się włączyć motywu Verris Kreator.' );
}

// --- Media --------------------------------------------------------------------------------------------------------
$verris_media = array();
foreach ( (array) ( $verris_dane['media'] ?? array() ) as $verris_m ) {
	$verris_zasob = (string) ( $verris_m['zasobId'] ?? '' );
	$verris_nazwa = basename( (string) ( $verris_m['nazwaPliku'] ?? '' ) );
	$verris_plik  = $verris_tmp . '/media/' . $verris_nazwa;
	if ( ! preg_match( '/^[0-9a-f-]{36}$/', $verris_zasob ) || ! is_file( $verris_plik ) ) {
		WP_CLI::warning( 'Pominięto zdjęcie bez pliku: ' . $verris_nazwa );
		continue;
	}
	// media_handle_sideload przenosi plik – importujemy kopię.
	$verris_tymczasowy = wp_tempnam( $verris_nazwa );
	copy( $verris_plik, $verris_tymczasowy );
	$verris_alt = sanitize_text_field( (string) ( $verris_m['alt'] ?? '' ) );
	$verris_id  = media_handle_sideload( array( 'name' => $verris_nazwa, 'tmp_name' => $verris_tymczasowy ), 0, $verris_alt );
	if ( is_wp_error( $verris_id ) ) {
		WP_CLI::warning( 'Nie udało się zaimportować zdjęcia ' . $verris_nazwa . ': ' . $verris_id->get_error_message() );
		continue;
	}
	update_post_meta( $verris_id, '_wp_attachment_image_alt', $verris_alt );
	update_post_meta( $verris_id, '_verris_zasob', $verris_zasob );
	$verris_media[ $verris_zasob ] = wp_get_attachment_url( $verris_id );
}

// --- Opcje witryny (przed stronami: adresy stron zależą od struktury bezpośrednich odnośników) ----------------------
update_option( 'blogname', sanitize_text_field( (string) ( $verris_dane['nazwa'] ?? '' ) ) );
update_option( 'blogdescription', sanitize_text_field( (string) ( $verris_dane['opis'] ?? '' ) ) );
update_option( 'permalink_structure', '/%postname%/' );
update_option( 'default_comment_status', 'closed' );
update_option( 'default_ping_status', 'closed' );
update_option( 'default_pingback_flag', 0 );
flush_rewrite_rules( false );

// --- Strony i wpisy: przebieg 1 (identyfikatory, rodzice przed dziećmi) ------------------------------------------
$verris_strony = (array) ( $verris_dane['strony'] ?? array() );
usort(
	$verris_strony,
	function ( $a, $b ) {
		$ra = empty( $a['rodzic'] ) ? 0 : 1;
		$rb = empty( $b['rodzic'] ) ? 0 : 1;
		return $ra === $rb ? ( (int) $a['kolejnosc'] <=> (int) $b['kolejnosc'] ) : $ra <=> $rb;
	}
);
$verris_id_stron = array();
foreach ( $verris_strony as $verris_s ) {
	$verris_klucz = (string) ( $verris_s['klucz'] ?? '' );
	if ( ! preg_match( '/^[a-z0-9_-]{1,140}$/', $verris_klucz ) ) {
		continue;
	}
	$verris_wpis = 'wpis' === ( $verris_s['typ'] ?? '' );
	$verris_post = array(
		'post_type'      => $verris_wpis ? 'post' : 'page',
		'post_status'    => 'publish',
		'post_title'     => sanitize_text_field( (string) ( $verris_s['tytul'] ?? '' ) ),
		'post_name'      => sanitize_title( (string) ( $verris_s['nazwa'] ?? '' ) ),
		'post_content'   => '',
		'menu_order'     => (int) ( $verris_s['kolejnosc'] ?? 0 ),
		'comment_status' => 'closed',
		'ping_status'    => 'closed',
	);
	if ( ! empty( $verris_s['rodzic'] ) && isset( $verris_id_stron[ $verris_s['rodzic'] ] ) && ! $verris_wpis ) {
		$verris_post['post_parent'] = $verris_id_stron[ $verris_s['rodzic'] ];
	}
	if ( $verris_wpis && ! empty( $verris_s['wpis']['data'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $verris_s['wpis']['data'] ) ) {
		$verris_post['post_date']    = $verris_s['wpis']['data'] . ' 10:00:00';
		$verris_post['post_excerpt'] = sanitize_textarea_field( (string) ( $verris_s['wpis']['lead'] ?? '' ) );
	}
	$verris_id = wp_insert_post( wp_slash( $verris_post ), true );
	if ( is_wp_error( $verris_id ) ) {
		verris_kwp_sprzatnij( $verris_tmp );
		WP_CLI::error( 'Nie udało się utworzyć strony „' . $verris_post['post_title'] . '”: ' . $verris_id->get_error_message() );
	}
	$verris_id_stron[ $verris_klucz ] = $verris_id;
	update_post_meta( $verris_id, '_verris_klucz', $verris_klucz );
	update_post_meta( $verris_id, '_verris_jezyk', sanitize_key( (string) ( $verris_s['jezyk'] ?? '' ) ) );
	update_post_meta( $verris_id, '_verris_grupa', sanitize_text_field( (string) ( $verris_s['grupa'] ?? '' ) ) );
	update_post_meta( $verris_id, '_verris_tytul', sanitize_text_field( (string) ( $verris_s['seo']['tytul'] ?? '' ) ) );
	update_post_meta( $verris_id, '_verris_opis', sanitize_text_field( (string) ( $verris_s['seo']['opis'] ?? '' ) ) );
	if ( ! empty( $verris_s['szablon'] ) && preg_match( '/^[a-z0-9-]{1,60}$/', (string) $verris_s['szablon'] ) ) {
		update_post_meta( $verris_id, '_wp_page_template', (string) $verris_s['szablon'] );
	}
	if ( ! empty( $verris_s['glowna'] ) ) {
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $verris_id );
	}
}

/** Adres strony z eksportu (token verris-kreator://strona/<klucz>). */
function verris_kwp_adres( $klucz, $id_stron ) {
	if ( isset( $id_stron[ $klucz ] ) ) {
		return (int) get_option( 'page_on_front' ) === $id_stron[ $klucz ] ? home_url( '/' ) : get_permalink( $id_stron[ $klucz ] );
	}
	return home_url( '/' );
}

/** Tokeny w treści → adresy tej instalacji (strony i zdjęcia). */
function verris_kwp_tokeny( $tresc, $id_stron, $media ) {
	$tresc = preg_replace_callback(
		'#verris-kreator://media/([0-9a-f-]{36})(?:/[0-9]+\.(?:jpg|webp))?#',
		function ( $m ) use ( $media ) {
			return isset( $media[ $m[1] ] ) ? esc_url( $media[ $m[1] ] ) : '';
		},
		$tresc
	);
	return preg_replace_callback(
		'#verris-kreator://strona/([a-z0-9_-]*)#',
		function ( $m ) use ( $id_stron ) {
			return esc_url( verris_kwp_adres( $m[1], $id_stron ) );
		},
		$tresc
	);
}

// --- Przebieg 2: treść z adresami ----------------------------------------------------------------------------------
foreach ( $verris_strony as $verris_s ) {
	$verris_klucz = (string) ( $verris_s['klucz'] ?? '' );
	if ( ! isset( $verris_id_stron[ $verris_klucz ] ) ) {
		continue;
	}
	$verris_tresc = verris_kwp_tokeny( (string) ( $verris_s['tresc'] ?? '' ), $verris_id_stron, $verris_media );
	$verris_wynik = wp_update_post( wp_slash( array( 'ID' => $verris_id_stron[ $verris_klucz ], 'post_content' => $verris_tresc ) ), true );
	if ( is_wp_error( $verris_wynik ) ) {
		verris_kwp_sprzatnij( $verris_tmp );
		WP_CLI::error( 'Nie udało się zapisać treści strony: ' . $verris_wynik->get_error_message() );
	}
}

// --- Menu (wp_navigation – blok nawigacji w nagłówku motywu bierze najnowsze menu) -------------------------------
$verris_linki = '';
foreach ( (array) ( $verris_dane['menu'] ?? array() ) as $verris_poz ) {
	$verris_etykieta = sanitize_text_field( (string) ( $verris_poz['etykieta'] ?? '' ) );
	$verris_strona   = (string) ( $verris_poz['strona'] ?? '' );
	if ( '' !== $verris_strona && isset( $verris_id_stron[ $verris_strona ] ) && 'page' === get_post_type( $verris_id_stron[ $verris_strona ] ) ) {
		$verris_atr = array(
			'label'          => $verris_etykieta,
			'type'           => 'page',
			'id'             => $verris_id_stron[ $verris_strona ],
			'url'            => verris_kwp_adres( $verris_strona, $verris_id_stron ),
			'kind'           => 'post-type',
			'isTopLevelLink' => true,
		);
	} else {
		$verris_atr = array(
			'label'          => $verris_etykieta,
			'url'            => html_entity_decode( verris_kwp_tokeny( (string) ( $verris_poz['adres'] ?? '' ), $verris_id_stron, $verris_media ) ),
			'kind'           => 'custom',
			'isTopLevelLink' => true,
		);
	}
	$verris_linki .= '<!-- wp:navigation-link ' . serialize_block_attributes( $verris_atr ) . " /-->\n";
}
$verris_menu = wp_insert_post(
	wp_slash(
		array(
			'post_type'    => 'wp_navigation',
			'post_title'   => 'Menu główne',
			'post_status'  => 'publish',
			'post_content' => $verris_linki,
		)
	),
	true
);
if ( is_wp_error( $verris_menu ) ) {
	WP_CLI::warning( 'Nie udało się utworzyć menu: ' . $verris_menu->get_error_message() );
}

flush_rewrite_rules( false );
verris_kwp_sprzatnij( $verris_tmp );
WP_CLI::log( sprintf( '[VERRIS_KWP] import stron=%d mediow=%d menu=%d', count( $verris_id_stron ), count( $verris_media ), count( (array) ( $verris_dane['menu'] ?? array() ) ) ) );

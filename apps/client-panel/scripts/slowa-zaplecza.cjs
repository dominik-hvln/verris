/**
 * P5-01 — słowa zaplecza, których nie może być w kodzie wysyłanym przeglądarce klienta: nazwy oprogramowania serwera,
 * port panelu, dostawca, miasta centrów danych i ścieżki węzła. Wspólne dla strażnika źródeł
 * (`src/lib/bundel-klienta.spec.ts`) i skryptu po buildzie (`scripts/sprawdz-bundel-klienta.mjs`).
 * Łapie też źródło wyrażenia regularnego (`Direct\s*Admin` w zminifikowanym JS). Wtyczka „LiteSpeed Cache”
 * (`litespeed-cache`), polskie „nie da się” i port panelu u INNEGO dostawcy w kreatorze migracji (`panelPort:2222`)
 * nie są zapleczem. CommonJS — czyta go Jest i Node.
 */
const WSPOLNE =
  /Direct\\s\*Admin|Custom(?:\s*|\\s\*)Build|CMD_API|(?<![\w,]):2222\b|\.[a-z]{2,}:2222\b|\}:2222\b|Cloud(?:\s*|\\s\*)Linux|CageFS|lswsctrl|\blsws\b|Lite(?:\s*|\\s\*)Speed(?![\s_-]?Cache)|Hetzner|Falkenstein|Norymberg|Nuremberg|Helsink|\/var\/log\/|\/opt\/verris\b|\/opt\/alt\b|\/usr\/local\/(?!bin\/php(?![a-z]))|\/root\/\.ssh|verris_node_deploy|verris-node\.sh|\bexim\b|dovecot|rspamd|imunify|mod_?security|węz[eł]/i;
/** Skróty tylko wielkimi literami — „da” i „lve” małymi to zwykłe słowa. */
const SKROTY = /\bDA\b|\bLVE\b/;
/** Tylko w modułach kontraktów: nazwa panelu (w kreatorze migracji panelu wolno — panel źródłowy u innego dostawcy). */
const TYLKO_KONTRAKTY = /Direct\s*Admin/i;

/**
 * Pierwszy fragment, który zdradza zaplecze, albo null — dla drzewa modułów `@verris/contracts/klient`.
 */
function slowoZaplecza(tekst) {
  const m = WSPOLNE.exec(tekst) || TYLKO_KONTRAKTY.exec(tekst) || SKROTY.exec(tekst);
  return m ? m[0] : null;
}

/**
 * To samo dla gotowego kodu przeglądarki, z jednym znanym wyjątkiem panelu (nie z kontraktów):
 * „DirectAdmin” jako panel ŹRÓDŁOWY u innego dostawcy w kreatorze migracji (klient wybiera go sam —
 * wyjątek jak w `src/lib/biala-etykieta.spec.ts`). Katalog wersji PHP węzła (`/opt/alt/`) nie ma już wyjątku —
 * decyzja 24 (4.11.2026): zakładka Cron podpowiada krótką nazwę `/usr/local/bin/phpXY` (jedyne dozwolone `/usr/local/`).
 * Źródło wyrażenia filtra white label (`Direct\s*Admin|…`) nadal jest wyciekiem.
 */
function slowoZapleczaWBuildzie(tekst) {
  const m = WSPOLNE.exec(tekst) || SKROTY.exec(tekst);
  return m ? m[0] : null;
}

module.exports = { slowoZaplecza, slowoZapleczaWBuildzie };

#!/usr/bin/env bash
# =============================================================================
# Zrzut FAKTYCZNEGO stanu hosta control-plane do pliku, ktory da sie zdiffowac.
#
#   sudo bash ops/scripts/stan-hosta-zrzut.sh            # wypisz na stdout
#   sudo bash ops/scripts/stan-hosta-zrzut.sh --zapisz   # zapisz do ops/stan-hosta/
#   sudo bash ops/scripts/stan-hosta-zrzut.sh --sprawdz  # porownaj z zapisanym, kod 1 przy roznicy
#
# PO CO TO ISTNIEJE
# ─────────────────
# 2026-08-24 okazalo sie, ze uruchomiony lancuch VERRIS_ANTISCAN ma piec regul
# i `--hitcount 80`, a `security-control-plane-egress.sh` generuje osiem regul
# i `40`. Zmiennej ANTISCAN_HITCOUNT nie ustawia zaden plik w repozytorium.
# Ktos albo zastosowal starsza wersje skryptu, albo poprawil lancuch recznie —
# i nikt nie zauwazyl tego przez miesiace, bo NIC tych dwoch stanow nie
# porownywalo. Repozytorium wygladalo na zrodlo prawdy i nim nie bylo.
#
# Ten skrypt niczego nie naprawia. Zamienia „nikt nie wie, co jest na tym
# serwerze" w plik, ktory widac w `git diff`. To jest roznica miedzy dniem
# a tygodniem, kiedy przyjda przenosiny albo awaria.
#
# CZEGO TU CELOWO NIE MA — i to jest wazniejsze niz to, co jest
# ─────────────────────────────────────────────────────────────
# Zadnych licznikow pakietow, PID-ow, czasow ani mtime. Zrzut ma byc
# DETERMINISTYCZNY: dwa przebiegi na niezmienionym hoscie musza dac identyczny
# plik. Inaczej kazdy `--sprawdz` pokazuje roznice, czlowiek przestaje je
# czytac i narzedzie umiera na alert fatigue w tydzien.
#
# Tak wlasnie zepsul sie snapshot crona w security-egress-watch.sh: hashowal
# wyjscie `ls -la`, ktore zawiera mtime katalogu /etc, wiec zmienial sie przy
# kazdej aktualizacji pakietow i od 4 czerwca nie wykrywal juz NICZEGO.
# Dlatego: `iptables -S` (specyfikacja regul), a nie `iptables -L -v` (licznik
# pakietow); `ss -tln` bez `-p` (bez PID-ow); listy zawsze przez `sort`.
#
# READ-ONLY. Skrypt nie zapisuje niczego poza wlasnym plikiem wyjsciowym.
# =============================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KATALOG="${KATALOG:-$ROOT/ops/stan-hosta}"
PLIK="$KATALOG/$(hostname -s 2>/dev/null || echo host).txt"
TRYB="wypisz"

case "${1:-}" in
  --zapisz)  TRYB="zapisz" ;;
  --sprawdz) TRYB="sprawdz" ;;
  "")        ;;
  *) echo "Uzycie: $0 [--zapisz|--sprawdz]" >&2; exit 1 ;;
esac

# Kazde wywolanie oslonione. Skrypt diagnostyczny, ktory sam sie wywraca na
# brakujacym narzedziu, jest bezuzyteczny akurat na hoscie, ktory bada.
zrzut() {
  echo "## iptables — filter (specyfikacja regul, bez licznikow)"
  iptables -S 2>/dev/null | sort || echo "(iptables niedostepny)"

  echo
  echo "## iptables — nat"
  iptables -t nat -S 2>/dev/null | sort || echo "(brak)"

  echo
  echo "## jednostki systemd verris-*"
  systemctl list-unit-files 'verris-*' --no-legend --no-pager 2>/dev/null \
    | awk '{print $1, $2}' | sort || echo "(brak)"

  echo
  echo "## timery verris-* (harmonogram, bez czasow nastepnego odpalenia)"
  for u in $(systemctl list-unit-files 'verris-*.timer' --no-legend --no-pager 2>/dev/null | awk '{print $1}' | sort); do
    printf '%s OnCalendar=%s\n' "$u" \
      "$(systemctl show "$u" -p TimersCalendar --value 2>/dev/null || echo '?')"
  done

  echo
  echo "## cron — tresc plikow"
  crontab -l 2>/dev/null | sed 's/^/root: /' || true
  find /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly \
       -type f -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum 2>/dev/null || true

  echo
  echo "## porty nasluchujace (bez PID-ow)"
  ss -H -tln 2>/dev/null | awk '{print $4}' | sort -u || echo "(ss niedostepny)"

  echo
  echo "## pakiety istotne dla control-plane"
  for p in postfix dovecot-core opendkim rspamd redis-server fail2ban certbot \
           docker-ce iptables-persistent unattended-upgrades; do
    printf '%s %s\n' "$p" \
      "$(dpkg-query -W -f='${Version}' "$p" 2>/dev/null || echo 'BRAK')"
  done

  echo
  echo "## uslugi docker compose (nazwy, bez tagow i ID)"
  (cd "$ROOT" && docker compose -f docker-compose.prod.yml config --services 2>/dev/null | sort) \
    || echo "(compose niedostepny)"

  echo
  echo "## pliki /etc/verris"
  find /etc/verris -type f -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum 2>/dev/null || true
}

case "$TRYB" in
  wypisz)
    zrzut
    ;;
  zapisz)
    mkdir -p "$KATALOG"
    TMP="$(mktemp)"
    zrzut >"$TMP"
    mv -f "$TMP" "$PLIK"
    echo "[stan-hosta] zapisano: $PLIK"
    echo "[stan-hosta] teraz: git diff -- ${PLIK#"$ROOT"/}"
    ;;
  sprawdz)
    if [ ! -f "$PLIK" ]; then
      echo "[stan-hosta] BRAK pliku odniesienia: $PLIK" >&2
      echo "[stan-hosta] Uruchom najpierw: $0 --zapisz i zacommituj wynik." >&2
      exit 2
    fi
    TMP="$(mktemp)"
    zrzut >"$TMP"
    if diff -u "$PLIK" "$TMP"; then
      echo "[stan-hosta] OK — host zgadza sie z zapisanym stanem."
      rm -f "$TMP"
    else
      echo "[stan-hosta] ROZNICA — host odbiegl od tego, co opisuje repozytorium." >&2
      echo "[stan-hosta] Kazda linia powyzej to zmiana, ktorej nikt nie zapisal." >&2
      rm -f "$TMP"
      exit 1
    fi
    ;;
esac

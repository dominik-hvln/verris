#!/usr/bin/env bash
#
# security-egress-kandydaci.sh — odczyt etapu 1 z X-41.
#
# Podsumowuje wpisy `VERRIS-FWD-KANDYDAT` z logu jądra: z którego kontenera
# wyszło połączenie i dokąd. To jest INWENTARZ, nie lista naruszeń — dopóki
# nie wiemy, z czym aplikacja rozmawia naprawdę, każdy próg egzekwowania
# byłby zgadywaniem.
#
# Użycie:
#   sudo bash ops/scripts/security-egress-kandydaci.sh            # od ostatniej doby
#   sudo bash ops/scripts/security-egress-kandydaci.sh "3 days ago"
#
# DLACZEGO BEZ `set -e`
# ─────────────────────
# Pierwsza wersja miała `set -euo pipefail` i umierała na pierwszym adresie bez
# wpisu odwrotnego: `getent hosts` zwraca 2, `pipefail` przenosi to na całe
# podstawienie, `set -e` kończy skrypt. Raport urywał się po nagłówku kolumn
# i wyglądał jak „brak danych".
#
# To jest ten sam defekt, który naprawiamy w panelu od rana: wynik nie do
# odróżnienia od awarii. W raporcie diagnostycznym jest szczególnie szkodliwy,
# bo cicha pustka prowadzi do wniosku „nic się nie dzieje" — a dane były.
#
# Raport jest tylko do odczytu, więc częściowy wynik jest lepszy niż żaden.
# Stąd `set -uo pipefail` bez `-e` i znacznik końca: jeśli go nie widzisz,
# raport NIE dobiegł końca i temu, co wyżej, nie należy ufać.

set -uo pipefail

OD="${1:-1 day ago}"

zrodlo_logu() {
  if command -v journalctl >/dev/null 2>&1; then
    journalctl -k --since "$OD" --no-pager 2>/dev/null || true
  elif [ -f /var/log/kern.log ]; then
    cat /var/log/kern.log
  else
    echo "Brak journalctl i /var/log/kern.log — nie mam skąd czytać." >&2
    return 1
  fi
}

WPISY="$(zrodlo_logu | grep 'VERRIS-FWD-KANDYDAT' || true)"
ILE_WPISOW="$(printf '%s' "$WPISY" | grep -c . || true)"

echo "=== KANDYDACI DO EGZEKWOWANIA ==="
echo "okno:   $OD"
echo "wpisów: ${ILE_WPISOW:-0}"
echo

if [ "${ILE_WPISOW:-0}" -eq 0 ]; then
  echo "Brak wpisów w tym oknie. To może znaczyć jedno z trzech:"
  echo "  1) obserwacja nie jest wpięta:   sudo iptables -S DOCKER-USER"
  echo "  2) łańcuch nie loguje:           sudo iptables -S VERRIS_FWD_OBSERW"
  echo "  3) kontenery nie wychodzą na 80/443 poza cele z allowlisty"
  echo
  echo "=== KONIEC RAPORTU ==="
  exit 0
fi

# Mapa IP → nazwa kontenera. Bez niej „172.18.0.7" nic nie mówi.
declare -A NAZWA
if command -v docker >/dev/null 2>&1; then
  while read -r nazwa ip; do
    [ -n "${ip:-}" ] && NAZWA["$ip"]="$nazwa"
  done < <(docker ps -q 2>/dev/null \
      | xargs -r docker inspect --format '{{.Name}} {{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null \
      | sed 's|^/||' \
      | awk '{for (i = 2; i <= NF; i++) if ($i != "") print $1, $i}' || true)
fi

echo "--- wg celu ---"
printf '%8s  %-16s %s\n' "POLACZEN" "ADRES" "NAZWA ODWROTNA"
printf '%s\n' "$WPISY" \
  | grep -o 'DST=[0-9.]*' | cut -d= -f2 | sort | uniq -c | sort -rn \
  | while read -r ile ip; do
      # `|| true` MUSI być wewnątrz podstawienia — inaczej brak PTR-a psuje
      # kod wyjścia przypisania. Adresy za CDN-em zwykle PTR-a nie mają,
      # więc to jest przypadek typowy, nie brzegowy.
      rev="$( { getent hosts "$ip" 2>/dev/null || true; } | awk 'NR==1{print $2}')"
      printf '%8s  %-16s %s\n' "$ile" "$ip" "${rev:-—}"
    done

echo
echo "--- wg kontenera ---"
printf '%8s  %-16s %s\n' "POLACZEN" "ADRES" "KONTENER"
printf '%s\n' "$WPISY" \
  | grep -o 'SRC=[0-9.]*' | cut -d= -f2 | sort | uniq -c | sort -rn \
  | while read -r ile ip; do
      printf '%8s  %-16s %s\n' "$ile" "$ip" "${NAZWA[$ip]:-?}"
    done

echo
echo "--- szczyt: najwiecej NOWYCH polaczen w jednej minucie, per kontener ---"
echo "(ta liczba wyznacza prog anty-skanu w etapie 2; dzisiejsze 40 dobrano"
echo " dla calego hosta jako JEDNEGO wiadra, nie dla pojedynczego kontenera)"
printf '%8s  %-16s %-20s %s\n' "POLACZEN" "ADRES" "MINUTA" "KONTENER"
printf '%s\n' "$WPISY" \
  | sed -n 's/^\(.\{15\}\).*SRC=\([0-9.]*\).*/\2 \1/p' \
  | sed 's/:[0-9][0-9]$//' \
  | sort | uniq -c | sort -rn | head -10 \
  | while read -r ile ip minuta; do
      printf '%8s  %-16s %-20s %s\n' "$ile" "$ip" "$minuta" "${NAZWA[$ip]:-?}"
    done

echo
echo "=== KONIEC RAPORTU ==="

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

set -euo pipefail

OD="${1:-1 day ago}"

zrodlo_logu() {
  if command -v journalctl >/dev/null 2>&1; then
    journalctl -k --since "$OD" --no-pager 2>/dev/null || true
  elif [ -f /var/log/kern.log ]; then
    cat /var/log/kern.log
  else
    echo "Brak journalctl i /var/log/kern.log — nie mam skąd czytać." >&2
    exit 1
  fi
}

WPISY="$(zrodlo_logu | grep 'VERRIS-FWD-KANDYDAT' || true)"

if [ -z "$WPISY" ]; then
  echo "Brak wpisów od: $OD"
  echo
  echo "To może znaczyć jedno z dwóch — i warto wiedzieć które:"
  echo "  1) obserwacja nie jest wpięta:  sudo iptables -S DOCKER-USER"
  echo "  2) kontenery nie wychodzą na 80/443 poza cele z allowlisty"
  exit 0
fi

# Mapa IP → nazwa kontenera. Bez niej „172.18.0.7" nic nie mówi.
declare -A NAZWA
if command -v docker >/dev/null 2>&1; then
  while read -r nazwa ip; do
    [ -n "${ip:-}" ] && NAZWA["$ip"]="$nazwa"
  done < <(docker ps -q 2>/dev/null | xargs -r docker inspect \
      --format '{{.Name}} {{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null \
      | sed 's|^/||' | awk '{for(i=2;i<=NF;i++) if($i!="") print $1, $i}')
fi

echo "=== KANDYDACI DO EGZEKWOWANIA (od: $OD) ==="
echo

echo "--- wg celu ---"
printf '%8s  %-16s %s\n' "POLACZEN" "ADRES" "NAZWA ODWROTNA"
echo "$WPISY" \
  | grep -o 'DST=[0-9.]*' | cut -d= -f2 | sort | uniq -c | sort -rn \
  | while read -r ile ip; do
      rev="$(getent hosts "$ip" 2>/dev/null | awk '{print $2}')"
      printf '%8s  %-16s %s\n' "$ile" "$ip" "${rev:-—}"
    done

echo
echo "--- wg kontenera ---"
printf '%8s  %-16s %s\n' "POLACZEN" "ADRES" "KONTENER"
echo "$WPISY" \
  | grep -o 'SRC=[0-9.]*' | cut -d= -f2 | sort | uniq -c | sort -rn \
  | while read -r ile ip; do
      printf '%8s  %-16s %s\n' "$ile" "$ip" "${NAZWA[$ip]:-?}"
    done

echo
echo "--- szczyt: najwiecej NOWYCH polaczen w jednej minucie, per kontener ---"
echo "(to jest liczba, ktora decyduje o progu anty-skanu — dzisiejsze 40"
echo " dobrano dla calego hosta jako jednego wiadra, nie dla kontenera)"
echo "$WPISY" \
  | sed -n 's/^\([A-Za-z]* [0-9 ]*[0-9]:[0-9][0-9]\):[0-9][0-9].*SRC=\([0-9.]*\).*/\1 \2/p' \
  | sort | uniq -c | sort -rn | head -10 \
  | while read -r ile minuta_a minuta_b minuta_c ip; do
      printf '%8s  %-16s %s\n' "$ile" "${ip:-?}" "${NAZWA[${ip:-x}]:-?}"
    done

echo
echo "Nastepny krok dopiero PO odczytaniu tego: progi ustawiamy z pomiaru,"
echo "nie z wartosci przeniesionej z lancucha OUTPUT."

#!/usr/bin/env bash
#
# przerwij-po-etapie.sh — NODE-02: etap, który zgłosił [FAIL], zatrzymuje
# instalację, zanim ruszy następny.
#
# Skrypty węzła mają dwa rodzaje sprawdzeń i do 2026-09-22 traktowały je tak
# samo:
#
#   · BRAMKA (preflight, rejestracja IP w DirectAdmin, sync pakietów) — jeśli
#     nie przeszła, każdy następny krok działa na złych założeniach. Brak
#     python3 albo curl zgłaszał [FAIL], a skrypt i tak instalował agenta
#     zadań, który bez nich nie działa. Nieudana rejestracja IP była tylko
#     [WARN] — a to dokładnie „A valid IP was not provided", od którego
#     zaczęło się Z-18.
#   · WERYFIKACJA (koniec readiness) — ma zebrać WSZYSTKIE usterki naraz i
#     dopiero wtedy odmówić; przerwanie po pierwszej kazałoby naprawiać je
#     po jednej, z pełnym przebiegiem między każdą.
#
# `set -e` w tych skryptach działa (funkcja z `return 1` kończy skrypt), ale
# nie widzi `log_fail`, które ustawia FAIL=1 i leci dalej. Ta funkcja
# zamienia zebrane w etapie [FAIL] w zatrzymanie — wołana po każdym etapie
# będącym bramką.

przerwij_po_etapie() {
  local etap="${1:?nazwa etapu wymagana}"
  if [ "${FAIL:-0}" != "0" ]; then
    echo "" >&2
    echo "[STOP] Etap „${etap}” zgłosił [FAIL] — przerywam, zanim następny etap zacznie działać na złych założeniach." >&2
    echo "[STOP] Napraw pozycje [FAIL] powyżej i uruchom skrypt ponownie (jest idempotentny)." >&2
    exit 1
  fi
}

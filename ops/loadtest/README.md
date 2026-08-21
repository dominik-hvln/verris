# Testy obciążeniowe (k6) — CYBER-7

Sprawdzają zachowanie krytycznych ścieżek pod obciążeniem: login, portfel/checkout,
provisioning oraz baseline API/paneli. Cel: **kontrolowana degradacja, nie awaria**;
weryfikacja rate-limitów i limitów węzła (LVE) pod realnym ruchem.

## Instalacja k6
- macOS: `brew install k6` · Linux: https://k6.io/docs/get-started/installation/

## Uruchomienie
```bash
# Baseline zdrowia (bez auth):
BASE_URL=https://api.verris.pl k6 run ops/loadtest/api-health.js

# Login (używa konta testowego — NIE produkcyjnego):
BASE_URL=https://api.verris.pl EMAIL=test@example.com PASSWORD=… k6 run ops/loadtest/auth-login.js

# Ścieżka zalogowanego użytkownika (portfel/dashboard) — wymaga tokenu:
BASE_URL=https://api.verris.pl TOKEN=eyJ… k6 run ops/loadtest/authed-mix.js
```

## Progi (thresholds)
Każdy skrypt ma progi p95 i error-rate — k6 zwróci kod ≠0 gdy przekroczone,
więc nadaje się do CI/nightly (workflow można dodać analogicznie do security-dast.yml).

## Uwaga
- Testuj na **stagingu** lub w oknie serwisowym; na produkcji zacznij od małego `--vus`.
- Login celowo trafia w rate-limit — obserwuj 429 jako **poprawne** zachowanie ochrony.

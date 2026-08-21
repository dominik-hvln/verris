# Verris — branding DirectAdmin (Evolution)

Pakiet brandingu panelu DA zgodny z aktualną dokumentacją (2026-07, DA 1.703).
Pełny runbook: [`ops/docs/DA_EVOLUTION_BRANDING.md`](../../docs/DA_EVOLUTION_BRANDING.md).

## Zawartość

| Ścieżka | Co to jest | Jak się instaluje |
|---|---|---|
| `templates/custom/login.html` | Strona logowania Verris (dark, PL, mobile-first) | skrypt → `data/templates/custom/` |
| `templates/custom/lost_password.html` | Reset hasła (⚠ przetestować flow) | skrypt, flaga `--with-lost-password` |
| `templates/custom/static/` | Logo/favicon pod `/static/` | skrypt |
| `plugin/verris_links/` | Kategoria „Verris" w menu Evolution | skrypt |
| `evolution/custom.css` | CSS panelu (zmienne Evolution + mobile) | ręcznie: UI → CSS Customizations |
| `evolution/login-page.css` | Fallback gdy bez własnego login.html | ręcznie: UI → Login Page |
| `assets/` | Źródłowe SVG (upload w UI → Logos) | ręcznie |

## Szybki start (węzeł)

```bash
scp -r ops/skins/verris-evolution ops/scripts/node-da-evolution-brand.sh root@node:/root/verris/
ssh root@node 'bash /root/verris/node-da-evolution-brand.sh --dry-run && bash /root/verris/node-da-evolution-brand.sh'
```

Potem jednorazowo kroki UI (skrypt wypisuje listę). Nie edytować niczego w
`data/skins/evolution/` — ginie przy update. `skin=evolution` w pakietach zostaje.

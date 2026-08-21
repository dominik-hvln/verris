# DirectAdmin — custom skin Verris (faza 2, roadmap)

> **Status: W REALIZACJI (2026-07-12).** Wariant wybrany: **branding override na
> Evolution** — artefakt gotowy w `ops/skins/verris-evolution/`, skrypt
> `ops/scripts/node-da-evolution-brand.sh`, runbook
> [`DA_EVOLUTION_BRANDING.md`](DA_EVOLUTION_BRANDING.md). Ten dokument zostaje
> jako zapis decyzji i opcji odrzuconych.

## Cel

Spójny wizualnie panel hostingowy z marką Verris (logo, kolory, typografia,
PL/EN, **mobile first-class**), zgodny z `apps/client-panel`, tak by klient po
przejściu z panelu Verris do DirectAdmin nie odczuł zmiany produktu.

## Stan obecny

- `skin=evolution` w każdym pakiecie (`buildDaPackageSpecFromPlan` → `skin`) — **bez zmian**.
- Język `pl` na poziomie pakietu i konta.
- Deep-linki Evolution (`/evo/user/...`) w `directadmin.service.ts` — **bez zmian**.
- Branding: artefakt `ops/skins/verris-evolution/` (login page, static, plugin menu,
  CSS na udokumentowanych zmiennych Evolution, spec uproszczenia menu).

## Decyzja techniczna (2026-07-12, zweryfikowana w docs DA 1.703)

| Opcja | Werdykt | Powód |
|-------|---------|-------|
| **Branding override na Evolution** | ✅ WYBRANA | jedyna oficjalna, przeżywa update'y; CSS variables + Menu Customizations + custom login + pluginy pokrywają branding i uproszczenie |
| Fork Evolution | ❌ niemożliwy | Evolution własnościowy, bez źródeł, bez ścieżki rebase |
| Pełny custom skin DA (jak cyberfolks) | ❌ odrzucona | architektura tokenowa Enhanced = legacy wg docs; utrata pluginów Evolution i deep-linków `/evo/`; duży koszt utrzymania |
| Głębokie uproszczenie UX | ➡ w `apps/client-panel` | REST API `/api/` + impersonacja `admin\|user` (oficjalne SSO); DA zostaje „pełną mocą" |

## Proces wdrożenia

1. ✅ Spec wizualny: paleta Pine+Mint z `apps/client-panel/src/app/globals.css`
   (nadpisuje ink/sky z `docs/brand/VERRIS_KEY_VISUAL.md` v1.0).
2. ✅ Artefakt w repo: `ops/skins/verris-evolution/`.
3. Dystrybucja na węzły: `scp` w bundlu onboard + `node-da-evolution-brand.sh`
   (+ jednorazowe kroki UI — do zautomatyzowania po kalibracji, patrz runbook).
4. Kroki UI na węźle testowym → kalibracja (odkrycie plików, w których DA
   utrwala Customize Evolution Skin) → pełna automatyzacja.
5. Walidator: checki brandingu w `node-audit.service.ts` (spec w runbooku).

## Ryzyka / zależności

- Aktualizacje DA mogą zmienić wewnętrzne klasy Evolution → sekcje B/C custom.css
  to best-effort; checklist mobile + desktop w runbooku po każdym update.
- `lost_password.html` — flow niezdokumentowany w całości; instalacja tylko po
  teście (`--with-lost-password`).
- Kompatybilność pluginów (WP manager, Redis) z ciemnym motywem — punkt checklisty.

## Powiązania

- Runbook wdrożenia: [`DA_EVOLUTION_BRANDING.md`](DA_EVOLUTION_BRANDING.md)
- Mapowanie pakietu: `apps/api/src/servers/da-package-spec.ts` (`skin`)
- Audyt: `node-audit.service.ts` — dodać checki brandingu
- Bootstrap v2 / DoD: `ops/docs/NODE_BOOTSTRAP_V2.md`

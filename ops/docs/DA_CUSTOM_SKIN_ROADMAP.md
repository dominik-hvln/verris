# DirectAdmin — custom skin Verris (faza 2, roadmap)

> **Status: faza 2 / follow-up — NIE blokuje bootstrap v2.** Na LIVE używamy
> standardowego skinu `evolution` (ustawiany w każdym pakiecie DA). Ten dokument
> opisuje docelowy branding Verris dla panelu DirectAdmin, żeby zaplanować pracę,
> a nie wdrażać ją przedwcześnie.

## Cel

Spójny wizualnie panel hostingowy z marką Verris (logo, kolory, typografia,
PL/EN), zgodny z `apps/client-panel`, tak by klient po przejściu z panelu Verris
do DirectAdmin nie odczuł zmiany produktu.

## Stan obecny (v2)

- `skin=evolution` w każdym pakiecie (`buildDaPackageSpecFromPlan` → `skin`).
- Język `pl` na poziomie pakietu i konta.
- Deep-linki Evolution (`/evo/user/...`) w `directadmin.service.ts`.

## Opcje techniczne

| Opcja | Zalety | Ryzyka |
|-------|--------|--------|
| **Fork Evolution** (custom skin oparty o Evolution) | najmniej pracy, blisko upstream | przy aktualizacjach DA trzeba mergować zmiany Evolution |
| **Pełny custom skin DA** | pełna kontrola UX/brandingu | duży koszt utrzymania, kompatybilność pluginów (WP manager, Redis) |
| **CSS/branding override** (logo, kolory na Evolution) | szybkie, niskie ryzyko | ograniczony zakres zmian |

Rekomendacja startowa fazy 2: **branding override na Evolution** (logo + paleta),
ewaluacja forka dopiero gdy override okaże się niewystarczający.

## Proces wdrożenia (szkic)

1. Spec wizualny: [`docs/brand/VERRIS_KEY_VISUAL.md`](../../docs/brand/VERRIS_KEY_VISUAL.md) (logo, paleta, typografia, PL/EN).
2. Build skinu/brandingu → artefakt w repo (`ops/skins/verris/`).
3. Dystrybucja na węzły: rsync/ansible w bundlu onboard (po deploy SSH key).
4. `skin=verris` w `buildDaPackageSpecFromPlan` (parametr `skin`) + sync pakietów.
5. Migracja istniejących kont (MODIFY skin) — przez audyt/naprawę (poziom caution).
6. Walidator: audyt sprawdza `skin` pakietu i raportuje rozjazd.

## Ryzyka / zależności

- Aktualizacje DA/Evolution mogą łamać custom skin → potrzebny test po update.
- Kompatybilność pluginów (WordPress manager, Redis, Git) w custom skinie.
- Utrzymanie PL/EN w obu skinach.

## Powiązania

- Mapowanie pakietu: `apps/api/src/servers/da-package-spec.ts` (`skin`).
- Audyt: dodać check `skin` w `node-audit.service.ts` przy wdrożeniu.
- Bootstrap v2 / DoD: `ops/docs/NODE_BOOTSTRAP_V2.md` (custom skin = non-goal v2).

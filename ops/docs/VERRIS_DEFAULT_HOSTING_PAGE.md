# Domyślna strona hostingu Verris (placeholder)

## Cel

Zamiast stockowej strony DirectAdmin („Something amazing will be constructed…”) klient i jego goście widzą czytelną stronę w stylu **cyberFolks** (layout, instrukcje), ale w **Key Visual Verris** (logo warstw, szmaragd, Inter).

## Key Visual

Pełna specyfikacja: [`docs/brand/VERRIS_KEY_VISUAL.md`](../../docs/brand/VERRIS_KEY_VISUAL.md).

## Artefakty

| Plik | Opis |
|------|------|
| `ops/hosting-default-page/index.html` | Szablon z tokenami DA |
| `ops/scripts/install-verris-default-page.sh` | Instalacja na węźle |

### Tokeny DirectAdmin

W `index.html` (tylko ten plik jest tokenizowany przy tworzeniu domeny):

- `|DOMAIN|`
- `|USERNAME|`
- `|DATECREATED|`
- `|IP|`

## Instalacja na węźle

**Najprościej (panel admin):** węzeł ACTIVE → **Profil hostingowy** → **Uruchom profil na węźle**. Po Governor/LiteSpeed API automatycznie pobiera szablon i instaluje go w DirectAdmin (wymaga wdrożonego API z endpointami `hosting-profile/default-page/*`).

**Onboard SSH:** każdy nowy węzeł z `node-onboard-live.sh` → `node-live-readiness.sh` instaluje szablon po profilu hostingowym. Wymaga bundle:

```bash
scp -r ops/hosting-default-page \
  ops/scripts/{install-verris-default-page,node-live-readiness,node-onboard-live,...}.sh \
  root@WĘZEŁ:/root/verris/
```

Ręcznie (aktualizacja szablonu bez pełnego onboardu):

```bash
# z repozytorium na węźle (po rsync/git pull)
sudo bash ops/scripts/install-verris-default-page.sh

# podgląd bez zmian
sudo bash ops/scripts/install-verris-default-page.sh --dry-run

# podmiana istniejących stockowych index.html (ostrożnie)
sudo bash ops/scripts/install-verris-default-page.sh --replace-existing
```

Skrypt ustawia:

1. `/usr/local/directadmin/data/templates/custom/default/index.html` — dla nowych resellerów
2. `/home/admin/domains/default/index.html` — dla domen tworzonych przez `admin` (domyślny creator Verris)

Jeśli konta tworzy inny reseller: `--reseller=nazwa`.

## Istniejąca domena (np. tprstudio.pl)

DA **nie** nadpisuje `public_html/index.html` po utworzeniu domeny. Opcje:

1. `--replace-existing` na węźle — podmienia stock DA **lub** stronę Verris z niewypełnionymi tokenami (`|DOMAIN|` itd.) i **uzupełnia tokeny** z `user.conf` / `domena.conf` (user, data utworzenia konta, IP węzła).
2. Nowe domeny: DA sam podstawia tokeny przy tworzeniu z szablonu `templates/custom/default`.

## Walidacja

```bash
curl -sI https://tprstudio.pl/ | head -5
# Treść: „Witamy na stronie”, „Verris”, bez „Powered by DirectAdmin”
```

## Powiązania

- Onboard węzła: `ops/scripts/node-live-readiness.sh` (krok 4/5 — instalacja szablonu)
- Profil węzła: `ops/scripts/node-hosting-profile.sh` (krok poprzedzający)
- Skin DA (faza 2): `ops/docs/DA_CUSTOM_SKIN_ROADMAP.md`

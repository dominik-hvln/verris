# Runbook — wdrożenie kredytów SLA na produkcję

Cel: wdrożyć nowy scheduler SLA (progi §15, rozliczenie miesięczne) i **bezpiecznie** włączyć
automatyczne rekompensaty. Kolejność jest krytyczna — flagę włączamy DOPIERO po migracji i po
publikacji regulaminu 1.1.0.

> Legenda: **[LOKALNIE]** = Twój komputer (repo), **[SERWER]** = control-plane po SSH,
> katalog z `docker-compose.prod.yml` i `.env.prod`.

---

## 0. Zanim zaczniesz — warunki

- [ ] Regulamin **1.1.0** opublikowany (`docs/legal/drafts/terms.md` → panel legal), data wejścia
      w życie ustalona. Bez tego automat wypłaca coś, czego umowa jeszcze nie gwarantuje.
- [ ] Jeśli są aktywni Klienci: minęło zawiadomienie §24 (≥30 dni). Bez Klientów — pomiń.

Migracja bazy (`20260710160000_sla_monthly_credits`) i przebudowa Prisma Client dzieją się
**automatycznie** w deployu — nie robisz ich ręcznie.

---

## 1. Wypchnij kod  [LOKALNIE]

```bash
git push origin live-release-readiness   # albo merge do main, zależnie od Twojego flow
```

Deploy (`prod-deploy-ghcr.sh`) wykona w kolejności:
1. `pull` nowych obrazów (api, panele, www),
2. migracje Payload (www),
3. `up -d` serwisów,
4. **`prisma migrate deploy`** — tu wchodzi migracja SLA (nowe kolumny `SlaCredit`,
   ustawienie `sla.maintenanceCapMinutes`),
5. health-gate + auto-rollback.

Obraz `api` jest budowany z nowym `schema.prisma`, więc Prisma Client ma już pola
`periodStart`, `availabilityBp`, `tierPercent`. Nie trzeba nic regenerować ręcznie.

---

## 2. Zweryfikuj migrację  [SERWER]

```bash
cd /opt/verris   # dostosuj ścieżkę

# Kolumny rozliczenia miesięcznego istnieją?
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "${POSTGRES_USER:-verris}" -d "${POSTGRES_DB:-verris_db}" -c \
  "\d \"SlaCredit\"" | grep -E "periodStart|availabilityBp|tierPercent"

# Ustawienie limitu konserwacji zasiane?
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "${POSTGRES_USER:-verris}" -d "${POSTGRES_DB:-verris_db}" -c \
  "SELECT key, value FROM platform_settings WHERE key LIKE 'sla.%' ORDER BY key;"
```

Oczekiwane: trzy kolumny obecne; `sla.creditsEnabled=0`, `sla.graceMinutes=5`,
`sla.maintenanceCapMinutes=480`.

**Flaga nadal `0` — to prawidłowe.** Kod jest wdrożony, ale nic jeszcze nie kredytuje.

---

## 3. (Opcjonalnie) test na sucho przed włączeniem

Scheduler rozlicza **poprzedni** miesiąc, o 03:00. Zanim włączysz flagę, możesz sprawdzić,
czy w poprzednim miesiącu były w ogóle incydenty MAJOR — jeśli nie, pierwszy przebieg i tak
nic nie zrobi, więc włączenie jest bezpieczne:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "${POSTGRES_USER:-verris}" -d "${POSTGRES_DB:-verris_db}" -c \
  "SELECT date_trunc('month', \"startedAt\") m, count(*)
     FROM \"ProbeIncident\"
    WHERE severity='MAJOR' AND status='RESOLVED'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 3;"
```

---

## 4. Włącz automatyczne rekompensaty

**Sposób A (zalecany) — panel admina.**
`admin.verris.pl` → Ustawienia → Platforma → sekcja **Kredyty SLA** → zaznacz „Automatyczne
kredyty SLA włączone" → Zapisz. Formularz pokazuje już progi §15 i limit konserwacji.
Zmiana idzie przez audytowany endpoint (`PLATFORM_SLA_CREDIT_POLICY_UPDATED`).

**Sposób B (fallback) — SQL bezpośrednio.** Tylko jeśli panel niedostępny:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "${POSTGRES_USER:-verris}" -d "${POSTGRES_DB:-verris_db}" -c \
  "INSERT INTO platform_settings (key, value, \"updatedAt\")
     VALUES ('sla.creditsEnabled','1', NOW())
     ON CONFLICT (key) DO UPDATE SET value='1', \"updatedAt\"=NOW();"
```

> Sposób B pomija audyt i cache ustawień w API — po nim zrestartuj `api`, żeby odświeżyło mapę:
> `docker compose -f docker-compose.prod.yml --env-file .env.prod restart api`

---

## 5. Weryfikacja po pierwszym przebiegu (następny dzień po 03:00)

```bash
# Czy powstały rekompensaty miesięczne?
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "${POSTGRES_USER:-verris}" -d "${POSTGRES_DB:-verris_db}" -c \
  "SELECT \"subscriptionId\", \"periodStart\", \"availabilityBp\", \"tierPercent\", amount
     FROM \"SlaCredit\" WHERE \"periodStart\" IS NOT NULL
     ORDER BY \"createdAt\" DESC LIMIT 20;"

# Logi schedulera
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 api | grep -i "SLA credit"
```

Kontrola zdrowia: `availabilityBp` sensowne (np. 9931 = 99,31%), `tierPercent` zgodny z tabelą,
`amount` = miesięczna opłata × tier%. Brak wierszy przy braku incydentów MAJOR = poprawnie.

---

## 6. Wyłączenie / rollback

- **Wyłącz naliczanie:** panel admina → odznacz „włączone", albo SQL `value='0'`.
- **Rollback kodu:** deploy ma auto-rollback przy nieudanym health-check. Migracja SLA jest
  addytywna (nowe kolumny nullable), więc **stary kod działa z nowym schematem** — rollback
  samego obrazu `api` nie wymaga cofania migracji.
- **Cofnięcie błędnej wypłaty:** kredyty to wpisy w portfelu (`WalletTx` typu ADJUSTMENT).
  Korektę robisz przez panel admina (portfel klienta), nie przez usuwanie wierszy.

---

## 7. Co się zmieniło w kodzie (kontekst dla review)

- `apps/api/src/billing/sla-credit.scheduler.ts` — przepisany: agregacja miesięczna, tabela progów,
  odliczanie okien konserwacyjnych, jedna wypłata/usługę/miesiąc. Testy: `*.spec.ts` (arytmetyka).
- `libs/database/prisma/schema.prisma` + migracja — `SlaCredit` dostał `periodStart`,
  `availabilityBp`, `tierPercent`; `incidentId` teraz nullable; unikat `(subscriptionId, periodStart)`.
- `platform-settings` (keys/service/dto/controller) — `multiplier`/`capPercent` wycofane,
  wprowadzone `maintenanceCapMinutes`.
- Panel admina — formularz SLA pokazuje progi §15 zamiast martwych pól mnożnika/limitu.
- `docs/legal/drafts/terms.md` — §15 ust. 3–5 (automat, ścieżka odwoławcza, agregacja miesięczna),
  wersja 1.1.0.

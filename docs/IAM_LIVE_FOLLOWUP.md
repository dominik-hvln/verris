# IAM — plan dokończenia do pełnego R-12 (follow-up)

> **Stan po Sprint B:** zaproszenia, accept, lista, revoke, disable, audyt API, guard ścieżek, menu subkonta, edycja uprawnień właściciela, `/users/me` dla operatora.  
> Ten dokument — checklist na osobną sesję przed ogłoszeniem „IAM 100% LIVE”.

## Zrobione ✅

- [x] `CustomerPermissionsGuard` — kolejność `hosting-dns` / `email` / `files` przed `services`
- [x] `GET/PATCH /users/me` z `principalUserId` (profil subkonta, nie właściciela)
- [x] Filtrowanie nawigacji + portfel (`client-nav-access.ts`)
- [x] UI edycji uprawnień członka (`PATCH /users/iam/members/:id`)
- [x] IAM w panelu domyślnie włączone (`NEXT_PUBLIC_FEATURE_IAM`)

## Do domknięcia (R-12 „widzi tylko dozwolone sekcje” end-to-end)

| # | Obszar | Opis | Priorytet |
|---|--------|------|-----------|
| 1 | **Strony dashboardu** | ✅ `middleware.ts` + `fetchSessionProfile` — redirect przed renderem | — |
| 2 | **Ustawienia subkonta** | ✅ Tylko profil / bezpieczeństwo / RODO; bez faktury i quick links | — |
| 3 | **Presety ról** | UI „Szablon: księgowość / devops / support” mapujący na zestawy `CustomerPermission` | P2 |
| 4 | **Audyt IAM w panelu** | Podgląd `customer.iam.*` z API audytu (owner) | P2 |
| 5 | **E-mail zaproszenia** | Smoke: invite → link → accept → login jako subkonto | P0 smoke |
| 6 | **Testy E2E API** | `customer-iam.service` + guard + `users/me` subaccount — rozszerzyć spec | P1 |
| 7 | **Dokumentacja oferty** | Regulamin / KB: kiedy subkonto, odpowiedzialność właściciela | P2 (Sprint D) |

## Smoke test (przed zamknięciem IAM)

1. Owner zaprasza `support@…` z `TICKETS_READ` + `TICKETS_MANAGE`.
2. Subkonto loguje się — widzi tylko Dashboard, Support, Ustawienia; brak portfela, serwisów, IAM.
3. `GET /services` → 403; `POST /tickets` → 200.
4. Owner edytuje uprawnienia → dodaje `SERVICES_READ` → po odświeżeniu menu „Serwery”.
5. Owner wyłącza subkonto → JWT kolejnego requestu 401/403.

## Nie blokuje IAM (osobne epiki)

- PayU/BLIK, rejestrator domen, Softaculous — `LIVE_READINESS_PLAN.md` Sprint E.

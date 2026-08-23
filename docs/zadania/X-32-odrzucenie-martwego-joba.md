# `X-32` — Alarm kazał posprzątać kolejkę, a nie było czym sprzątać

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | ŚREDNI (warstwa operatorska) |
| **Nakład** | S (~2 h) |
| **Zależy od** | `X-30` (jego alarm), `Z-18` (dzięki niemu ślad ma wartość) |
| **Status** | zamknięte w kodzie, **D3 przy pierwszym użyciu** |
| **Data** | 2026-08-23 |
| **Decyzja** | właściciel produktu wybrał „dorobić akcję w panelu" zamiast jednorazowego czyszczenia Redisa |

---

## Jak to wyszło

`X-30` naprawiło alerting. `VerrisProvisioningQueueFailed` zapalił się z prawdziwego powodu
i wskazał cztery martwe joby, które doprowadziły do `Z-18`.

Naturalny następny ruch — usunąć je — okazał się **niewykonalny**. Panel operatora ma przy tych
jobach wyłącznie przycisk **Retry**, a kontroler administracyjny dokładnie dwa endpointy:
listowanie i ponowienie.

Retry nic tu nie daje: węzła nie ma, więc job padnie ponownie, podbije licznik prób i dołoży
kolejne wpisy do audytu. Cztery martwe joby zamieniłyby się w cztery martwe joby z dłuższą
historią.

Zostawało grzebanie w Redisie ręcznie — czyli zmiana stanu produkcyjnego dotyczącego subskrypcji
klientów **bez żadnego śladu w audycie**. Dokładnie ta klasa operacji, przeciwko której powstał
cały dzisiejszy dzień.

**To nie jest usterka tych czterech jobów. To luka w warstwie operatorskiej**, która ujawni się
ponownie przy pierwszym prawdziwym niepowodzeniu provisioningu — z tą różnicą, że wtedy po drugiej
stronie będzie klient.

## Rozwiązanie

`POST /admin/provisioning-queue/:id/odrzuc` + przycisk **Odrzuć** w panelu, obok Retry.

### Trzy reguły, każda z powodem

**Tylko stan `failed`.** Usunięcie joba aktywnego albo czekającego osierociłoby provisioning
w trakcie: konto na węźle mogłoby powstać, a system przestałby o nim wiedzieć. Ograniczenie
siedzi w usłudze, nie w kontrolerze — to reguła o kolejce, nie o HTTP. Przy innym stanie API
odpowiada wyjaśnieniem, które panel pokazuje wprost.

**Powód wymagany**, tak samo jak przy retry. Operacja bez powodu to operacja, której za pół roku
nikt nie wyjaśni.

**Najpierw odczyt, potem usunięcie.** Ślad w audycie zbierany jest **przed** `job.remove()` —
po usunięciu nie ma już czego odczytać. Zapisujemy subskrypcję, joba, typ, liczbę prób, ostatni
błąd i powód podany przez człowieka. Po `Z-18` ten ostatni błąd niesie wreszcie **prawdziwą**
przyczynę, więc wpis ma realną wartość dowodową — jeszcze wczoraj zapisałby zdanie o brakującym
pakiecie DirectAdmina, którego nigdy nie brakowało.

### Osobna akcja audytu

`PROVISIONING_JOB_DISCARDED_BY_ADMIN`, nie wariant retry. W raportach odrzucenie i ponowienie to
dwie różne decyzje i nie wolno im się zlewać.

### Dwa kliknięcia, nie jedno

Retry można cofnąć następnym retry. Odrzucenia nie da się cofnąć **wcale** — wpis znika z Redisa.
Potwierdzenie jest po to, żeby ta różnica była wyczuwalna w palcach, a nie tylko opisana.

### Zdanie, które musi stać przy przycisku

> Usuwa wpis z kolejki bez możliwości cofnięcia. **Subskrypcja zostaje nietknięta.**

Operator ma prawo założyć, że „odrzuć" anuluje zamówienie. Nie anuluje — sprząta kolejkę i tyle.
Los zamówienia to osobna decyzja i nie chcę, żeby jeden przycisk robił obie rzeczy. To musi być
napisane tam, gdzie się klika, a nie w dokumentacji, której nikt nie otworzy w trakcie incydentu.

## Strażnik

`apps/api/src/test/odrzucenie-martwego-joba.spec.ts` — 13 asercji:

- osobna akcja audytu istnieje;
- metoda `odrzucJob` sprawdza `getState()` i przepuszcza tylko `failed` — **najważniejsza asercja
  w tym pliku**;
- audyt zapisuje subskrypcję, powód, `failedReason` i `attemptsMade`;
- odczyt śladu wypada **przed** `.remove()`;
- kontroler wymaga powodu i stoi za tym samym `@StaffPerm('PROVISIONING_MANAGE')` co reszta
  kolejki (asercja pilnuje, żeby nikt nie wystawił odrzucania luźniejszym kontrolerem);
- panel ma akcję serwerową i przycisk, wymaga powodu ≥ 5 znaków, mówi o nietkniętej subskrypcji
  i pokazuje się wyłącznie przy jobach z `failedReason`.

**Czerwieni się na starym kodzie: 11 z 13.**

Dwie uwagi o samych testach, bo obie są przykładem czegoś, czego dziś unikaliśmy:

- Odczyty plików panelu są **leniwe**, wewnątrz asercji. Odczyt na poziomie `describe` wywalał cały
  plik testowy, zanim cokolwiek się policzyło — a wtedy nie wiadomo, ile asercji czerwieni się na
  starym kodzie, tylko że „nie skompilowało się".
- Asercja o warunku `row.failedReason` nie mierzy odległości w znakach, tylko relację między
  warunkiem a przyciskiem. Wersja licząca znaki zepsuła się od dopisania komentarza — i przez
  chwilę kusiło mnie, żeby poszerzyć okno zamiast poprawić asercję. To byłoby naprawianie testu
  zamiast kodu.

## Czego to NIE dowodzi

Że działa na produkcji. Dowód **D3** powstanie przy pierwszym użyciu: odrzucić jeden z czterech
martwych jobów, obejrzeć wpis `PROVISIONING_JOB_DISCARDED_BY_ADMIN` w audycie i sprawdzić, że
`verris_provisioning_queue_depth{state="failed"}` spadło o jeden.

To akurat da się zrobić od razu po wdrożeniu — w przeciwieństwie do `Z-18`, który czeka na węzeł.

## Czego to nie obejmuje

- **Losu czterech subskrypcji**, które dostały zwrot i status `PENDING_PAYMENT`. Odrzucenie joba
  ich nie dotyka. Jeśli wiszą jako testowe niedokończone zamówienia, to osobne sprzątanie — po
  stronie bazy, nie kolejki.
- **Odrzucania hurtem.** Świadomie: cztery joby odrzuca się cztery razy, z czterema powodami.
  Przycisk „odrzuć wszystkie" jest wygodny dokładnie do momentu, w którym ktoś kliknie go
  na kolejce z prawdziwym zamówieniem.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-30` | jego alarm zażądał operacji, której produkt nie miał |
| `Z-18` | dzięki niemu `failedReason` w śladzie audytu mówi prawdę |
| `A-25`, `A-26` | warstwa operatorska: zatrzymywanie szkody bez SSH |

## Dowód po

- `apps/api/src/common/audit/audit.actions.ts` — `PROVISIONING_JOB_DISCARDED_BY_ADMIN`
- `apps/api/src/subscriptions/provisioning-queue.service.ts` — `odrzucJob`
- `apps/api/src/subscriptions/provisioning-queue.admin.controller.ts` — `POST :id/odrzuc`
- `apps/admin-panel/.../provisioning-queue/` — `actions.ts`, `odrzuc-button.tsx`, `page.tsx`
- `apps/api/src/test/odrzucenie-martwego-joba.spec.ts` — 13 asercji, 11 czerwonych na starym kodzie

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**Stan w macierzy po:** `CZĘŚCIOWE` / `CZĘŚCIOWY` — do pierwszego odrzucenia na produkcji.

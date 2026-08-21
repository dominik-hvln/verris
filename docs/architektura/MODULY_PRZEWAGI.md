# Moduły przewagi — katalog pomysłów `V-*`

<!-- Uratowane z ROADMAP_GAPS.md przy porządkowaniu repo 2026-08-21.
     Reszta tamtego dokumentu trafiła do docs/archiwum/ jako nieaktualna. -->

> **To katalog pomysłów, nie plan.** Powstał w maju 2026, przed audytem parytetu. Część pozycji
> została już zrealizowana (V-06 badge uptime, V-03 częściowo — patrz `H-11` w macierzy, gdzie
> „podgląd przywracania" okazał się pokazywać stan bieżący zamiast zawartości archiwum), część
> jest w epikach roadmapy po starcie. Przed sięgnięciem po którykolwiek moduł sprawdź jego stan
> w `audyt/dane/macierz.csv` — kolumna „Rynek PL" mówi, czy to naprawdę przewaga, czy nadrabianie.

### 10.5 Przewagi „ponad konkurencję” (unikalne dla Verris)

| Obszar | Dlaczego możecie wygrać |
|--------|-------------------------|
| **Autoskalowanie LVE w czasie rzeczywistym** z portfelem | Mało hosterów shared ma przejrzysty billing per godzina + guard w UI |
| **Status page powiązany z węzłem klienta** (banner w panelu) | Spójność „mój serwer vs globalny status” |
| **Impersonacja z audytem + 30 min** | Lepsze niż „daj hasło klientowi” |
| **EKO + punkty + badge** (G już w dużej mierze DONE) | Marketing ekologiczny |
| **Prawdziwa migracja 1-click** (po R-MIG) | Hosterzy często tylko „wyślij ticket” — tu realna automatyzacja |

### 10.6 Nowe moduły przewagi do backlogu `V-*`

| ID | Moduł | Panel | Dlaczego warto | Najlepszy moment |
|----|-------|-------|----------------|------------------|
| V-01 | **Health Score usługi** | Klient | Jedna ocena 0-100 pokazuje, czy hosting jest zdrowy: DNS, SSL, backup, incydenty, LVE, PHP | Po diagnostyce i status page |
| V-02 | **Asystent konfiguracji domeny** | Klient | Mniej ticketów po zakupie; klient widzi rekordy, nameservery, propagację, SPF/DKIM/DMARC | Z onboardingiem |
| V-03 | **Backup restore preview** | Klient | Bezpieczniejsze restore: co zostanie nadpisane, z jakiego backupu i z jakim ryzykiem | Po backup/snapshot UX |
| V-04 | **Tryb bezpiecznych zmian** | Klient | Przed SSL/DNS/restore/migracją panel proponuje snapshot i rollback plan | Po backup/snapshot UX |
| V-05 | **Rekomendacje planu/autoscalingu** | Klient | Upsell oparty na danych: czasem upgrade tańszy niż autoscaling | Po wykresach LVE |
| V-06 | **Publiczny uptime badge klienta** | Klient/Publiczne | Klient może pokazać własny uptime, a Verris dostaje wiarygodny branding | Po status page/SLA |
| V-07 | **Centrum domeny bez rejestratora** | Klient | Wartość domenowa bez integracji z rejestrem: DNS, SSL, mail records, nameservery | Przed rejestratorem domen |
| V-08 | **Timeline klienta** | Staff | Jedna oś zakupów, ticketów, płatności, incydentów, impersonacji i zmian technicznych | Po profilu 360 |
| V-09 | **Sugestie odpowiedzi bez AI** | Staff | Rules engine z gotową poradą na podstawie diagnostyki, bez kosztu i ryzyka LLM | Po DNS/SSL diagnostics |
| V-10 | **Runbooki w tickecie** | Staff | Standaryzuje support: checklisty problemów z SSL, DNS, wolną stroną | Po szablonach i diagnostyce |
| V-11 | **Escalation button** | Staff | Eskalacja z automatycznym kontekstem: usługa, węzeł, diagnostyka, logi, incydenty | Po profilu 360 |
| V-12 | **Customer risk flag** | Staff/Admin | Wczesne wykrycie klientów zagrożonych odejściem lub problemami operacyjnymi | Po billing/admin UI |
| V-13 | **Preflight GO-LIVE dashboard** | Admin | Interaktywny `GO_NO_GO_PROD.md`; lepsze niż sama checklista markdown | Sprint stabilizacyjny |
| V-14 | **Capacity planner** | Admin | Prognoza pojemności węzła na podstawie planów, alokacji i realnego usage | Po widoku węzła |
| V-15 | **Anomaly board** | Admin | NOC-lite: spike LVE, failed webhooks, stale heartbeat, failed provisioning, wzrost ticketów | Po metrykach kolejek |
| V-16 | **Incident composer** | Admin | Komunikat status page + banner + mail do dotkniętych klientów z jednego formularza | Po powiadomieniach |
| V-17 | **Changelog / komunikaty produktowe** | Admin/Klient | Profesjonalna komunikacja zmian, prac technicznych i promocji | Po beta |
| V-18 | **Feature flags per klient/plan** | Admin/System | Bezpieczne bety nowych modułów i różnicowanie planów Pro/Business | Przed funkcjami P2 |

---

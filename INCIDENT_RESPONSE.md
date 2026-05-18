# Verris — Procedura naruszenia ochrony danych osobowych (RODO Art. 33-34)

> Sprint 1 / L-12. Dokument operacyjny dla zespołu Verris. Aktualizować po każdym incydencie i po pen-testach.

## 1. Definicja naruszenia

Zgodnie z RODO Art. 4 ust. 12 — naruszenie ochrony danych osobowych to **incydent prowadzący do**:
- **utraty** danych osobowych (np. utrata backupu, awaria storage bez kopii, ransomware),
- **modyfikacji** danych osobowych (np. nieautoryzowana zmiana profilu klienta),
- **nieuprawnionego ujawnienia** danych osobowych (np. nieautoryzowany dostęp do panelu admina, wyciek bazy, pomyłkowy mailing do złej grupy),
- **nieuprawnionego dostępu** do danych osobowych (np. logowanie z wykradzionym kredencjałem).

**Co NIE jest naruszeniem (ale wymaga zgłoszenia w ticket bezpieczeństwa):**
- pojedyncza nieudana próba logowania,
- atak DDoS bez ujawnienia danych,
- spam email z `verris.pl` (jeśli nie wyciekła lista mailingowa).

## 2. Klasyfikacja ryzyka

| Poziom    | Przykłady                                                                                                  | SLA reakcji |
|-----------|------------------------------------------------------------------------------------------------------------|-------------|
| **P0** Krytyczne | Wyciek bazy `User`/`Account`/`Invoice` na zewnątrz; ransomware na node DA; ujawnienie haseł lub `2FA secrets` | < 1 h       |
| **P1** Wysokie   | Nieautoryzowany dostęp admina/staffa; ujawnienie loginów DA jednego klienta; utrata backupu PII             | < 4 h       |
| **P2** Średnie   | Wyciek nie-PII (np. logi techniczne); naruszenie integralności danych technicznych (przywracalne z backupu) | < 24 h      |
| **P3** Niskie    | Próby ataku bez sukcesu; podejrzane wzorce w `LoginAttempt` bez przejęcia konta                              | < 72 h      |

## 3. Role i odpowiedzialności

| Rola                   | Osoba odpowiedzialna   | Co robi                                                                                       |
|------------------------|------------------------|-----------------------------------------------------------------------------------------------|
| **Incident Commander** | CTO (lub admin on-call) | Klasyfikuje, koordynuje, podejmuje finalne decyzje                                             |
| **Tech Lead**          | Dyżurny admin           | Mitigation: rotacja kluczy, izolacja node'a, snapshoty                                         |
| **Communications**     | Dział sprzedaży/CX      | Komunikacja z klientami, status page                                                           |
| **Legal/RODO**         | Inspektor RODO          | Zgłoszenie do UODO (PUODO), powiadomienie klientów (Art. 34 jeśli wysokie ryzyko)              |
| **Post-mortem**        | CTO                     | RCA (root cause analysis), update procedur, retrospektywa                                       |

W przypadku **incydentu P0 lub P1 wymagającego komunikacji z UODO**: do 72 h od stwierdzenia naruszenia.

## 4. Timeline 72h (RODO Art. 33)

```
T+0   Detekcja (alerty Prometheus, raport klienta, audit log spike, 3rd party)
       └─ Otwarcie incydentu w trackerze (np. GitLab Issues, label = `incident`)
       └─ Slack/Discord channel: #incident-YYYY-MM-DD
       └─ Wstępna klasyfikacja P0..P3

T+15m  Escalation
       └─ Page CTO/admin on-call (jeśli jeszcze nie)
       └─ Zatrzymanie potencjalnego rozprzestrzeniania (firewall, suspend node)
       └─ Snapshot bazy + node disk images (forensics)

T+1h   Containment
       └─ Rotacja kluczy: APP_KMS_KEY, JWT_SECRET, Stripe webhook secret, DA passwords
       └─ Wymuszenie wylogowania wszystkich userów (incrementBy on JWT version claim)
       └─ Wyłączenie eksponowanych endpointów (jeśli incydent dotyczy publicznego API)

T+4h   Assessment
       └─ Identyfikacja zakresu: ile rekordów, kategorie danych, kategorie subiektów
       └─ Ocena ryzyka dla klientów (Art. 34: czy "wysokie ryzyko"?)
       └─ Dokument w trackerze: Affected Users, Data Categories, Mitigation Steps

T+24h  Recovery start
       └─ Restore z czystego backupu (jeśli ransomware/utrata)
       └─ Re-prowizjonowanie node'a (jeśli kompromitacja)
       └─ Częściowe przywrócenie usług (priorytetyzacja: status page, login, billing)

T+48h  Decision: zgłaszamy do UODO?
       └─ JEŚLI ryzyko dla osób fizycznych jest "prawdopodobne" (Art. 33) — TAK
       └─ JEŚLI ryzyko jest "wysokie" — DODATKOWO informujemy klientów (Art. 34)
       └─ Wyjątki Art. 34(3): odpowiednie środki techniczne (np. szyfrowanie) zastosowane,
          środki ograniczające ryzyko zastosowane, niewspółmierny wysiłek

T+72h  Zgłoszenie do UODO (jeśli decyzja TAK)
       └─ Formularz: https://uodo.gov.pl/pl/p/zgloszenie-naruszenia
       └─ Dane: opis naruszenia, kategorie i przybliżona liczba osób, kategorie i liczba
              rekordów, dane kontaktowe IOD (rodo@verris.pl), prawdopodobne konsekwencje,
              zastosowane lub proponowane środki naprawcze
       └─ Powiadomienie klientów (jeśli Art. 34): e-mail (template M-08), banner w panelu,
              status page

T+7d   Post-mortem
       └─ Spotkanie zespołu (max 1h)
       └─ RCA: 5 Whys, sequence of events, what worked / what didn't
       └─ Action items: konkretne taski w sprintcie + odpowiedzialni
       └─ Update tej procedury

T+30d  Follow-up audit
       └─ Czy action items wykonane?
       └─ Czy alerty/monitoring wykrywałyby ten incydent automatycznie?
       └─ Update DEPLOY.md / RUNBOOK z wnioskami
```

## 5. Komunikacja z klientami (Art. 34)

Wymagana gdy naruszenie powoduje **wysokie ryzyko dla praw i wolności osób fizycznych**.

### 5.1 Kanały
1. **E-mail** — szablon `M-08 Incident Impacting Your Service` (Sprint 2 / mailing).
2. **Banner w panelu klienta** — `IncidentBanner` na każdej stronie, z linkiem do post-mortem.
3. **Status page** — incydent z severity = MAJOR + publiczny opis.

### 5.2 Treść powiadomienia (RODO Art. 34 ust. 2)
- jasny opis natury naruszenia,
- dane kontaktowe IOD (rodo@verris.pl),
- prawdopodobne konsekwencje naruszenia,
- środki zastosowane lub proponowane przez Verris w celu zaradzenia naruszeniu,
- zalecenia dla klientów (np. „zalecamy zmianę hasła", „obserwuj transakcje na koncie bankowym").

### 5.3 Język
- Klarowny, bez żargonu („naruszenie ochrony danych" zamiast „incident affecting confidentiality").
- Polski (canonical) + angielski (jeśli klient ma `locale = 'en'`).

## 6. Checkpoints po incydencie

- [ ] Rotacja `APP_KMS_KEY` (re-encrypt `daPasswordEnc`, `twoFactorSecret`, `twoFactorRecoveryCodesEnc`).
- [ ] Rotacja `JWT_SECRET` (wszyscy userzy wylogowani — wymuszone na poziomie strategy).
- [ ] Rotacja `WEBHOOK_SECRET` (Stripe → re-roll w Stripe Dashboard, update `.env.prod`).
- [ ] Zmiana haseł DA na wszystkich node'ach (jeśli możliwy compromise — full rotation).
- [ ] Audyt aktywnych sesji JWT (kto był zalogowany w czasie incydentu).
- [ ] Audyt `AuditLog` w oknie ±24h od incydentu (filter `action = 'IMPERSONATION_*'`, `LOGIN_*`).
- [ ] Pen-test/security audit zlecony zewnętrznie (jeśli incydent klasy P0).
- [ ] Update tej procedury z lessons learned.
- [ ] Update `DEPLOY.md` runbook'ów dla nowych alertów Prometheus.

## 7. Lista potrzebnych narzędzi i kontaktów

- **Slack/Discord channel** (per-incident: `#incident-YYYY-MM-DD-<slug>`).
- **GitLab Issue label**: `incident`, dodatkowo `severity:p0|p1|p2|p3`.
- **PagerDuty/OpsGenie** (TODO: skonfigurować, obecnie ręczna eskalacja).
- **UODO formularz**: https://uodo.gov.pl/pl/p/zgloszenie-naruszenia.
- **Numer telefonu UODO** (zgłoszenia ustne wyjątkowe, nie wystarczają): +48 22 531 03 00.
- **Lawyer kontakt**: [TODO uzupełnić po lawyer review Sprint 0].
- **Stripe support** (jeśli incydent dotyczy płatności): https://support.stripe.com/contact.
- **Resend support** (jeśli incydent dotyczy mailingu po wdrożeniu Sprint 2): support@resend.com.

## 8. Logi do zachowania (forensics)

Po incydencie zachowujemy minimum 1 rok od daty zamknięcia:

- snapshot `pg_dump` bazy z chwili wykrycia (przechowywany off-site, encrypted),
- pełen `AuditLog` w oknie ±48h od incydentu,
- snapshoty Caddy/Nginx access log i error log,
- output `journalctl -u verris-*` z node'ów,
- Slack/Discord log z kanału `#incident-*` (export jako PDF + JSON).

## 9. Kontakt i kanały zgłoszeń

- **Wewnętrzne**: Slack `#security`, GitLab Issues z labelem `security`.
- **Klienci**: rodo@verris.pl (RODO/IOD), security@verris.pl (techniczne zgłoszenia bezpieczeństwa).
- **Bug bounty** (TBD): planowany na etap H jeśli skala klientów uzasadni.

## 10. Historia zmian

| Data       | Wersja | Zmiana                                                    | Autor           |
|------------|--------|-----------------------------------------------------------|-----------------|
| 2026-05-17 | 0.1.0  | Pierwsza wersja, draft Sprint 1                           | AI assistant    |
| TBD        | 1.0.0  | Lawyer review + zatwierdzenie przez CTO                   | TBD             |

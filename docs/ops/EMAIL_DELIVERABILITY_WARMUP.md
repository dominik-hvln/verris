# Deliverability poczty — warm-up IP i reputacja (CMP-5)

Cel: poczta Verris ma trafiać do skrzynki odbiorczej, nie do spamu — mimo że nowe IP
nie mają historii. To warunek, by poczta stała się realnym argumentem sprzedażowym.

Mamy już **dashboard deliverability w panelu** (SPF/DKIM/DMARC/RBL/PTR, z gotowymi
podpowiedziami rekordów) — `DeliverabilityService`. Ten dokument opisuje **proces**
(warm-up + monitoring), bo egzekwowanie limitów wysyłki dzieje się na węźle (Exim).

---

## 1. Warunki wstępne (zanim wyślemy pierwszy mail)

| Element | Wymóg |
|---|---|
| **PTR / rDNS** | Każde IP wysyłające ma rekord PTR = nazwa hosta (np. `mail.verris.pl`). Bez tego duzi odbiorcy odrzucają. |
| **HELO/EHLO** | Zgodne z PTR i z rekordem A. |
| **SPF** | `v=spf1 a mx include:_spf.verris.pl ~all` na domenie wysyłającej. |
| **DKIM** | Podpis 2048-bit, selektor stały (np. `x`), klucz publiczny w DNS. |
| **DMARC** | Start `p=none; rua=...` (zbieramy raporty), po 2–4 tyg. → `p=quarantine`. |
| **TLS** | Wychodzące i przychodzące przez STARTTLS/TLS. |
| **Pętle zwrotne (FBL)** | Rejestracja w feedback loops: Gmail Postmaster Tools, Microsoft SNDS/JMRP, a w PL — kontakt do nadużyć Onet/WP/Interia. |

Bez kompletu PTR+SPF+DKIM+DMARC **nie zaczynamy** warm-upu.

---

## 2. Harmonogram warm-up (na IP)

Stopniowo zwiększamy dzienny wolumen, utrzymując wysokie zaangażowanie (otwarcia) i
niski bounce/spam. Tabela orientacyjna — dostosuj do realnego ruchu:

| Dzień | Maks. maili / dobę | Uwagi |
|---|---|---|
| 1–2 | 50 | Tylko zaangażowani odbiorcy / własne skrzynki testowe |
| 3–4 | 100 | |
| 5–7 | 250 | Obserwuj bounce < 2%, spam-rate < 0,1% |
| 8–10 | 500 | |
| 11–14 | 1 000 | |
| 15–21 | 2 500 → 5 000 | Zwiększaj ~2× co kilka dni, jeśli reputacja stabilna |
| 22–30 | 10 000+ | Pełny wolumen po ~4 tyg. |

Zasady twarde:
- Jeśli **bounce > 5%** lub pojawia się **listing na RBL** → wstrzymaj wzrost, zdiagnozuj.
- Nie skacz wolumenem >2× dziennie.
- Dziel ruch transakcyjny (ważny) i masowy (newsletter) — najlepiej osobne IP/subdomeny.

Egzekwowanie na węźle (Exim): dzienny limit wysyłki per IP/domena (np. `smtp_accept_*`,
ratelimit ACL). Warto trzymać `mailWarmupStartedAt` per węzeł i wyliczać bieżący cap.

---

## 3. Monitoring reputacji (ciągły)

- **RBL/DNSBL**: mamy sprawdzanie w `DeliverabilityService` (RBL_ZONES). Do dołożenia:
  **scheduler** sprawdzający IP każdego węzła np. co 6 h i **alert do adminów**
  (mamy `NotificationsService` + ops watchdog) przy listingu.
- **Gmail Postmaster**: śledź Domain/IP reputation (High/Medium/Low), spam rate, auth.
- **Microsoft SNDS**: kolory (zielony/żółty/czerwony) + complaint rate.
- **DMARC rua**: czytaj raporty zbiorcze — wykrywają spoofing i błędy SPF/DKIM.
- **Bounce/complaint**: zbieraj w logach Exim; próg complaint < 0,1%.

---

## 4. Reakcja na incydent reputacji

1. Listing RBL → ustal przyczynę (skompromitowane konto? spam klienta? open relay?).
2. Odetnij źródło (zawieś konto, mamy audyt akcji + cordon), wyczyść kolejkę.
3. Złóż delisting w danym RBL; popraw to, co je wywołało.
4. Jeśli IP „spalone" — rotacja IP + ponowny warm-up (dlatego trzymamy zapas IP/węzeł).

---

## 5. Co dołożyć w kodzie (sized — następny krok)

- **RBL/reputation scheduler** (co 6 h, per IP węzła) + alert (NotificationsService) — ~mały/śr.
- Pole `mailWarmupStartedAt` na Server + wyliczany dzienny cap (informacyjnie w adminie) — mały.
- Skrypt węzła ustawiający PTR/rDNS i ratelimit Exim w profilu hostingowym — śr (ops).

---

## 6. Przewaga Verris

Konkurencja ma dojrzałe IP (parytet), ale **my dajemy klientowi widoczność**: dashboard
deliverability z gotowymi rekordami i statusem RBL/DMARC w panelu. Po wdrożeniu warm-upu
i monitoringu poczta przestaje być ryzykiem, a staje się argumentem („poczta, która
realnie dochodzi, z panelem który to pokazuje”).

# Skalowanie floty i redundancja (CMP-9)

Konkurencja ma własne centra danych; my rośniemy **węzłami** (Hetzner/OVH) — to zaleta
(niski capex na start, elastyczność), pod warunkiem zdyscyplinowanego skalowania. Mamy
już guardraile: cordon, max kont, rezerwa headroom (OPS-1), dashboard pojemności (OPS-2),
proaktywny alert + auto-cordon (OPS-3), bezpieczny drain węzła (OPS-4). To fundament.

## 1. Model skalowania (capacity-driven)
- Każdy węzeł ma **rezerwę headroom** (% CPU/RAM/dysku) pod burst autoskalowania.
- Gdy fleet utilization przekroczy próg (np. 70%) → **alert** + dorzucenie węzła zanim
  zrobi się ciasno (OPS-3 już alertuje; dochodzi procedura zamówienia węzła).
- Nowy węzeł: kreator podpięcia (ADM-1) → profil hostingowy → wejście do puli placementu.
- Placement nowych kont respektuje cordon/maxAccounts (NodeSelector).

## 2. Redundancja i DR
- **Geo**: start PL (OVH/Hetzner region), potem drugi region (DE) dla rozproszenia.
- **Backupy off-site** (mamy) — odtworzenie konta na innym węźle przy awarii.
- **Drain** (OPS-4) — kontrolowane przeniesienie kont z węzła do wygaszenia/serwisu.
- Plan DR: RTO/RPO per klasa usługi; ćwiczenie odtworzenia raz/kwartał.

## 3. Ekonomia (dla inwestora)
- Koszt węzła (Hetzner/OVH) vs liczba kont × ARPU → **marża rośnie z zagęszczeniem**
  (więcej kont na węzeł do progu headroom), a autoskalowanie dokłada przychód bez
  proporcjonalnego kosztu.
- Capex na start minimalny (wynajem, nie zakup DC) — runda finansuje kilka węzłów +
  redundancję, nie budowę serwerowni.

## 4. Co finansuje runda (CMP-9)
- Pula węzłów na start + rezerwa pod wzrost (zgodnie z prognozą ~300→6 000 klientów).
- Drugi region (redundancja) po osiągnięciu pierwszej trakcji.
- Narzędzia DR + ćwiczenia odtwarzania.

## 5. Ryzyko i mitigacja
- Awaria pojedynczego węzła → off-site backup + drain/restore na inny węzeł.
- Wzrost szybszy niż flota → auto-cordon chroni jakość (nie pakujemy ponad headroom).
- Uzależnienie od dostawcy → multi-provider (Hetzner + OVH) od początku.

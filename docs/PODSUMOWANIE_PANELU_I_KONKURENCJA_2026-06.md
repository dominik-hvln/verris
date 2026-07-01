# Verris — podsumowanie panelu, porównanie z konkurencją, status tasków i plan rozwoju

Data: 2026-06-30. Zakres: stan platformy po bieżącej sesji.
Uwaga o statusach: „zrobione" = kod gotowy i zweryfikowany statycznie (tsc/architektura). „Wdrożone" zależy od Twojego deployu i migracji — to robisz samodzielnie. Porównanie z konkurencją (dhosting, cyberFolks, home.pl, OVH) na poziomie kategorii funkcji; dokładne ceny/specyfikacje warto sprawdzić u źródła (konektory SimilarWeb/Ahrefs wymagają autoryzacji, niedostępne w tej sesji).

---

## A. Co mamy w panelu — pełny przegląd funkcji

### 1. Hosting (panel klienta, na żywo z DirectAdmin)
- Przegląd usługi z health-score, skróty kontekstowe, asystent „co dalej", tryb prosty/zaawansowany.
- Domeny i DNS: pełny manager rekordów (add/edit/delete), subdomeny, domeny dodatkowe/aliasy (domain pointers), presety DNS (MX Google/Microsoft, SPF).
- Bazy MySQL: tworzenie/usuwanie w panelu, info o wersji silnika, zdalny dostęp (access hosts).
- Pliki: menedżer plików account-scoped (sandbox ścieżek, limit pobierania), upload.
- Poczta: skrzynki (create/delete/zmiana hasła), forwardery/aliasy, autorespondery, catch-all, SpamAssassin per domena.
- Wersja PHP per konto (CloudLinux PHP Selector), Cron (presety), konta FTP.
- SSL: Let's Encrypt (www/SAN/domeny dodatkowe), ostrzeżenia o wygasającym certyfikacie.
- Aplikacje 1-click: WordPress (wp-cli), Marketplace (Nextcloud/PrestaShop) przez APP_INSTALL.
- Narzędzia WWW (.htaccess): przekierowania URL, ochrona katalogów hasłem, antyhotlink, blokowanie IP, wymuszenie HTTPS + kanonizacja www.
- Backupy: self-service 1-klik (strona+DB), harmonogram automatyczny per konto + retencja, backupy off-node (offsite) z raportem.
- WAF (ModSecurity/OWASP CRS), Staging 1-click (kopia→subdomena, push-to-live), Deploy.
- Statystyki konta (transfer/dysk/liczniki) + proaktywne alerty o limitach (dysk/transfer).
- Kreator stron (TYMCZASOWO UKRYTY) — generator, galeria szablonów, bloki; kod pozostaje.

### 2. Poczta jako osobny produkt
- Plan poczty (mail-only), provisioning bez hostingu WWW, hub z zakładkami tylko pocztowymi.
- Health-score poczty (MX/SMTP/IMAP), Roundcube (webmail custom), deliverability (SPF/DKIM/DMARC + RBL), warm-up IP/reputacja.

### 3. VPS / Cloud (Hetzner)
- Provisioning/lifecycle przez API Hetzner, rozliczanie miesięczne, klucze SSH (provisioning bez hasła root), UI klienta, katalog planów w adminie.

### 4. Domeny
- Rejestracja w checkout (OpenProvider), katalog + ceny/promocje.

### 5. Monitoring i niezawodność
- Monitoring stron (free always-on + płatny tier, interwały), uptime 30 dni, response time, alerty e-mail (sterowane per usługa), SSL expiry, status page publiczny, kredyty SLA za przestój.

### 6. Bezpieczeństwo i konto
- Passkeys/WebAuthn (klient + admin/staff) z enforcement i fallbackiem, opcjonalne 2FA/passkey, polityka haseł.
- Historia logowań, aktywne sesje (zdalne wylogowanie), dziennik aktywności konta, alerty przy zmianach passkey.
- Self-service zmiana e-mail (double opt-in), RODO: eksport/usunięcie danych, cookies, DPA, retencja.

### 7. Billing i portfel
- Portfel prepaid (ledger idempotentny, lock wiersza), autoskalowanie godzinowe z „bezpiecznikiem kosztów".
- Stripe + faktury, KSeF (klient API, generator FA XML, scheduler, klucze/certy w adminie), dane sprzedawcy/nabywcy.
- Plany roczne (upsell), rabat startowy, przypomnienia o odnowieniu + ostrzeżenie o niedoborze portfela, sklep z dodatkami, free trial (modele zarządzalne z admina).

### 8. Program partnerski (reseller/afiliacja) — NOWE
- % prowizji recurring od płatności poleconych + bonus „darmowy hosting za N poleceń".
- Naliczanie idempotentne (scheduler), karencja, wypłaty do portfela (natychmiast) i na konto (akceptacja admina).
- Panel partnera (klient) + administracja zasad i kolejka wypłat (admin).

### 9. Marketing / komunikacja — NOWE/rozszerzone
- Newsletter/mailing w adminie: kampanie do zgód marketingowych (segment auto z opt-inu), Markdown+CTA, podgląd liczby odbiorców, wyślij/zaplanuj/odwołaj, List-Unsubscribe + opt-out (RODO), worker wysyłki.
- Centrum powiadomień (klient): dzwonek in-app, kategorie, e-mail per usługa.

### 10. Wsparcie
- Tickety (temat, podpowiedzi KB, szablony odpowiedzi), CSAT, widoczne SLA wg planu, model 24/7 (tier-0 auto + on-call), Baza Wiedzy w panelu.

### 11. Panel admina / staff i operacje
- RBAC: role/działy, granularne uprawnienia, „Mój zespół" (operatorzy, zaproszenia, aktywacja), dziennik aktywności operatorów, gating nawigacji + twarde egzekwowanie API.
- Onboarding węzła (wizard), dashboard pojemności floty, guardraile/cordon, alert pojemności + auto-cordon, bezpieczny drain + plan migracji, watchdog offline + raport floty, NodeTask + retry, RBL scheduler.
- Centrum diagnostyki klienta, cockpit migracji, globalna wyszukiwarka + command palette, dashboard biznesowy (MRR/churn/flota), go/no-go live-readiness.
- VPN WireGuard (dostęp do paneli wewnętrznych), runbooki (rotacja sekretów, upgrade Prisma).

### 12. Infrastruktura / jakość
- Monorepo: API (NestJS 11), 4 panele (Next.js 16), Prisma 6.19, libs (database/sdk/contracts).
- Zero-downtime/rolling deploy, hardening (rate limit, webhook dedupe, trust proxy), audyt destrukcyjnych akcji, npm audit, EKO (kWh/CO₂, raport, punkty).

---

## B. Porównanie z konkurencją (poziom funkcji)

Legenda: ✅ jest · ➖ częściowo/podstawowo · ❌ brak · „?" zależne od planu.

| Obszar | Verris | dhosting | cyberFolks | home.pl | OVH |
|---|---|---|---|---|---|
| Rozliczenia godzinowe / portfel prepaid | ✅ | ❌ | ❌ | ❌ | ➖ |
| Autoskalowanie zasobów z bezpiecznikiem kosztów | ✅ | ➖ | ➖ | ❌ | ➖ |
| Backupy self-service + offsite + retencja | ✅ | ✅ | ✅ | ➖ | ✅ |
| WAF (ModSecurity/OWASP) w panelu | ✅ | ➖ | ✅ | ➖ | ➖ |
| Staging 1-click + push-to-live | ✅ | ➖ | ✅ | ❌ | ➖ |
| Monitoring stron + uptime + SLA credits | ✅ | ➖ | ➖ | ❌ | ➖ |
| Passkeys/WebAuthn (klient i zespół) | ✅ | ❌ | ➖ | ❌ | ➖ |
| Deliverability poczty (DKIM/DMARC/RBL/warm-up) | ✅ | ➖ | ➖ | ➖ | ➖ |
| KSeF (faktury ustrukturyzowane) | ✅ | ? | ? | ? | ❌ |
| VPS/Cloud (Hetzner) w tym samym panelu | ✅ | ➖ | ➖ | ✅ | ✅ |
| Program partnerski/reseller z prowizjami | ✅ | ✅ | ✅ | ✅ | ✅ |
| Newsletter do klientów (zgody marketingowe) | ✅ | ➖ | ➖ | ➖ | ❌ |
| RBAC + zespół operatorów (granularny) | ✅ | ? | ? | ➖ | ✅ |
| Status page publiczny + benchmarki | ✅ | ➖ | ✅ | ➖ | ✅ |
| EKO (ślad węglowy z realnych metryk) | ✅ | ❌ | ➖ | ❌ | ➖ |
| Kreator stron (no-code) | ⏸ ukryty | ✅ | ✅ | ✅ | ➖ |
| Publiczne API klienta + tokeny | ❌ (spec) | ➖ | ➖ | ➖ | ✅ |
| Reseller white-label (sub-konta) | ❌ (afiliacja jest) | ✅ | ✅ | ✅ | ✅ |
| Email marketing jako produkt dla klienta | ❌ (spec) | ❌ | ➖ | ➖ | ❌ |
| Marketplace aplikacji 1-click | ✅ (WP/Nextcloud/Presta) | ✅ | ✅ | ✅ | ➖ |

Wniosek: w obszarach „operacyjnych" (rozliczenia, autoskalowanie, bezpieczeństwo, deliverability, monitoring/SLA, EKO, KSeF) jesteśmy mocniejsi od typowej konkurencji. Słabsze/niedomknięte punkty: kreator stron (świadomie ukryty), publiczne API klienta, pełny reseller white-label, email-marketing jako produkt sprzedażny.

---

## C. Status tasków (do Twojej oceny: zrobione vs wdrożone)

Skróty: ✅ zrobione (kod gotowy, zweryfikowane statycznie) · ⛔ zablokowane zewnętrznie · ⏸ ukryte/wstrzymane. Wdrożenie produkcyjne (deploy + migracje) leży po Twojej stronie.

Audyt i etapy bazowe (#1–#16): ✅ wszystkie (audyt bezpieczeństwa/płatności/autoskalowania/węzłów/integracji, ETAP 1–9, VPN, dok. OpenProvider).

Bezpieczeństwo i konto: ✅ Passkeys klient/admin/staff (#17, #26, #30, #84), enforcement i toggle (#79, #85, #56), historia logowań/sesje/dziennik/zmiana e-mail (#87, #93, #94, #95, #SEC-7..10), polityka haseł, RODO-1 (#80).

Hosting/klient (funkcje): ✅ WordPress 1-click (#18), WAF (#19), monitoring (#20, #101–#106), staging (#21), bezpiecznik kosztów (#22), EKO (#23, C5), menedżer plików (#57–#60), DNS/subdomeny/domeny dodatkowe (#39, #74, PANEL-3/5), MySQL (#66, PANEL-10), poczta (skrzynki/forward/autoresp/catch-all/spam #69, PANEL-1/8/9), PHP/Cron/FTP (#49, #70), SSL (#62, MON-5), Narzędzia WWW (PANEL-2/4/13), backupy (#35, #151, PANEL-11/11b), statystyki+alerty (PANEL-12/14), Marketplace (#51).

Produkty: ✅ Poczta jako produkt (#34, #36, MAIL-*), VPS/Cloud Hetzner (#41–#44), Domeny w checkout (#33, #156), Free trial (#31, UX-3).

Billing/finanse: ✅ KSeF (#25, #29), dane firmy (#28), portfel/ledger (ETAP 1), plany roczne (#54), rabat startowy (#99/BILL-1), przypomnienia odnowień (#100/BILL-2), sklep dodatków (#55), kalkulator kosztów (#157).

Wsparcie: ✅ CSAT (#46), SLA (#47), podpowiedzi (#48), KB + szablony (#50, #83), model 24/7 (#152), zaufanie/status page (#153).

Admin/staff i operacje: ✅ RBAC pełny (RBAC-1..9 / #179–#187), onboarding węzła (#11/ADM-1), pojemność floty i guardraile (OPS-1..5), watchdog (#38), diagnostyka/migracje/wyszukiwarka (ADM-2..4), dashboard biznesowy (BIZ-1), live-readiness (#37), runbooki (SEC-11, VER-UPG-5).

Wersjonowanie i jakość: ✅ NestJS 11 / Next 16 / Prisma 6 (VER-UPG-1..6), niezawodność/wydajność (REL-1, PERF-1/2), pitch deck (PITCH-1..4).

Konkurencja (CMP) i kreator (BUILD): ✅ CMP-1..10; ✅ BUILD-A..K (kreator: galeria, bloki premium, efekty, web-fonty, bloki edytorialne, szablony branżowe) — ale kreator jest teraz ⏸ UKRYTY w panelu (kod pozostaje).

Program partnerski / marketing / alerty (najnowsze): ✅ RESELL + RESELL-UI (#192, #195), MAIL-ADMIN newsletter (#193), PANEL-14 alerty limitów (#189), SPEC email-marketing i API (#190, #191).

⛔ Zablokowane zewnętrznie (3):
- #71 Sentry — wymaga DSN + instalacji pakietu (Twoja decyzja/konto).
- #72 Treści Bazy Wiedzy + sprzątnięcie danych testowych — na produkcji.
- #73 Pełny E2E na żywym koncie — po licencji LiteSpeed.

⏸ Wstrzymane: Kreator stron (ukryty na Twoją prośbę).

Łącznie: ~201 pozycji, z czego zrobione/zweryfikowane statycznie ~198; 3 zablokowane zewnętrznie; 1 obszar ukryty.

---

## D. Czego brakuje względem konkurencji + propozycje rozwoju

Priorytety domknięcia (gap vs konkurencja):
1. Publiczne API klienta + tokeny (spec gotowy) — przewaga dla agencji/devów; konkurencja (OVH) ma. Średni nakład.
2. Reseller white-label / sub-konta — pełny model partnerski (DA reseller, własny cennik, panel partnera zarządzający kontami). Dziś mamy afiliację; konkurencja ma white-label. Duży nakład, duży przychód B2B.
3. Email-marketing jako produkt dla klienta (spec gotowy) — nowy przychód powtarzalny na bazie istniejącej poczty/deliverability.
4. Kreator stron — decyzja: dokończyć z prawdziwą fotografią/self-host fontów i innymi układami (sidebar/poziomy scroll) albo zostawić ukryty i postawić na 1-click WordPress + szablony WP.

Propozycje rozwoju (poza gap):
- Wielojęzyczność panelu (i18n EN) — fundament pod sprzedaż poza PL.
- Analityka stron klientów (privacy-first, alternatywa GA) — spójna z EKO/RODO.
- SSL premium/wildcard/upload własnego certu; transfery domen + większy katalog TLD.
- Powiadomienia SMS/push; proformy + dunning + zarządzanie metodami płatności.
- Self-host fontów (RODO) i CDN/cache layer.
- 2FA/passkey enforcement per dział, eksport CSV dziennika operatorów, logi kolejki/dostarczalności e-maili (drobne domknięcia).

Rekomendowana kolejność: (1) API klienta → (2) reseller white-label → (3) email-marketing produkt → (4) decyzja o kreatorze. Każdy z tych punktów dotyka billingu/RODO — przy wdrożeniu domykamy eksport/usuwanie danych i audyt.

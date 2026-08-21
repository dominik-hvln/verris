---
title: "Słownik pojęć hostingowych — 30 terminów prostym językiem"
slug: "slownik-pojec-hostingowych"
excerpt: "DNS, TTL, LVE, propagacja, SLA, DPA — hosting mówi własnym językiem. Tłumaczymy 30 najczęstszych pojęć bez żargonu, z przykładami."
metaTitle: "Słownik pojęć hostingowych — 30 terminów prostym językiem | Verris"
metaDescription: "Co znaczą DNS, TTL, MX, SSL, SLA, DPA, autoskalowanie, propagacja i inne pojęcia hostingowe. Krótkie, zrozumiałe definicje z przykładami."
keyword: "pojęcia hostingowe"
cluster: "Wybór hostingu"
type: "spoke"
status: "draft"
---

# Słownik pojęć hostingowych — 30 terminów prostym językiem

**W skrócie:** hosting ma własny żargon, który utrudnia porównywanie ofert. Poniżej 30 pojęć, które realnie spotkasz przy zakupie, migracji i codziennej obsłudze strony — każde w jednym zdaniu, bez ściemy.

## Podstawy

**Hosting współdzielony** — wiele kont na jednym serwerze, z izolacją zasobów. Najczęstszy wybór dla stron firmowych.
**VPS** — wydzielony serwer wirtualny z pełnym dostępem administracyjnym. [Kiedy go wybrać](/blog/vps-czy-hosting-wspoldzielony).
**Domena** — adres Twojej strony (np. `verris.pl`).
**Subdomena** — adres podrzędny (np. `sklep.verris.pl`).
**Panel** — interfejs do zarządzania usługą (u nas: DirectAdmin + panel klienta).

## Zasoby i wydajność

**CPU / vCPU** — moc obliczeniowa przydzielona kontu.
**RAM** — pamięć operacyjna; jej brak objawia się błędami przy większym ruchu.
**Dysk NVMe** — szybka pamięć masowa; wpływa na czas ładowania.
**Transfer** — ilość danych przesłanych do odwiedzających.
**Autoskalowanie** — [automatyczne zwiększanie zasobów w piku](/blog/autoskalowanie-hostingu) i zwalnianie ich po nim.
**Tryb ECO** — nazwa funkcji zwalniającej nadwyżkę zasobów, gdy ruch spada.
**Cache** — zapisana, gotowa wersja strony serwowana bez odpytywania bazy.
**LVE** — mechanizm CloudLinux ograniczający zasoby pojedynczego konta, by jedno nie zabrało mocy pozostałym.

## Domeny i DNS

**DNS** — system tłumaczący nazwę domeny na adres IP serwera.
**Rekord A** — wskazuje domenę na adres IP serwera WWW.
**Rekord CNAME** — alias jednej nazwy na drugą.
**Rekord MX** — wskazuje serwer poczty.
**TTL** — jak długo serwery mogą trzymać starą odpowiedź DNS w pamięci.
**Propagacja** — czas, przez który [zmiana DNS](/blog/zmiana-dns) rozchodzi się po świecie.
**Authinfo (kod EPP)** — kod potrzebny do [transferu domeny](/blog/transfer-domeny).
**Okres karencji** — czas po wygaśnięciu, w którym domenę [wciąż można odnowić](/blog/odnowienie-domeny).

## Poczta

**IMAP** — protokół odbioru poczty, trzyma wiadomości na serwerze.
**SMTP** — protokół wysyłania poczty.
**SPF / DKIM / DMARC** — rekordy potwierdzające, że wiadomość naprawdę pochodzi z Twojej domeny; bez nich [maile lądują w spamie](/blog/migracja-poczty).
**Webmail** — poczta w przeglądarce (u nas Roundcube).

## Bezpieczeństwo i zgodność

**SSL / TLS** — [szyfrowanie połączenia](/funkcje/ssl); bez niego przeglądarka ostrzega odwiedzających.
**Let's Encrypt** — urząd wydający darmowe certyfikaty SSL, odnawiane automatycznie.
**Kopia zapasowa (backup)** — [zapis stanu strony](/blog/kopie-zapasowe-strony), który da się przywrócić.
**SLA** — [zobowiązanie umowne do poziomu dostępności](/blog/co-to-jest-sla), najlepiej z rekompensatą.
**Uptime** — procent czasu, w którym usługa działa.
**DPA** — umowa powierzenia przetwarzania danych, wymagana przez [RODO](/blog/rodo-a-hosting).
**Podprocesor** — podmiot, któremu dostawca powierza część przetwarzania (np. operator centrum danych).
**EOG** — Europejski Obszar Gospodarczy; [dane w jego granicach](/blog/serwery-w-ue-rodo) upraszczają zgodność.

## Rozliczenia

**Odnowienie** — przedłużenie usługi na kolejny okres; [uwaga na skok ceny](/blog/drogie-odnowienie-hostingu).
**Cena brutto** — z podatkiem VAT; tak podajemy wszystkie kwoty.
**Rozliczenie godzinowe** — płacisz [za faktyczne godziny użycia](/blog/pakiet-vs-zuzycie) nadwyżki zasobów.

---

*Wiesz już, o czym mówimy. [Zobacz hosting bez gwiazdek](/hosting) albo [policz koszt autoskalowania](/przenies-strone#kalkulator).*

---
title: "Analityka bez cookies — jak mierzyć ruch bez banera zgód"
slug: "analityka-bez-cookies"
excerpt: "Baner zgód psuje wrażenia i zaniża dane. Wyjaśniamy, jak działa analityka bez cookies, co realnie zmierzysz, kiedy zgoda nie jest potrzebna — i gdzie kończy się mit „braku danych osobowych”."
metaTitle: "Analityka bez cookies — statystyki bez banera zgód | Verris"
metaDescription: "Jak działa analityka bez cookies, czym różni się od Google Analytics, co można zmierzyć bez zgody i jakich obowiązków RODO ona NIE zdejmuje."
keyword: "analityka bez cookies"
cluster: "Bezpieczeństwo i uptime"
type: "spoke"
status: "draft"
faq: [{"q": "Czy to zastąpi Google Analytics?", "a": "Do podstawowych decyzji (co czytają, skąd przychodzą) — tak. Do atrybucji kampanii reklamowych i remarketingu — nie."}, {"q": "Czy naprawdę nie potrzebuję zgody?", "a": "Jeśli narzędzie nie zapisuje ani nie odczytuje informacji na urządzeniu użytkownika — zgoda z art. 5(3) ePrivacy (u nas: Prawo komunikacji elektronicznej) nie jest wymagana. To jednak nie znaczy, że nie przetwarzasz danych osobowych: adres IP nim jest. Potrzebujesz podstawy prawnej z RODO, zwykle prawnie uzasadnionego interesu, i powinieneś anonimizować IP."}, {"q": "Czy analityka bez cookies zdejmuje obowiązki RODO?", "a": "Nie zdejmuje, tylko zmniejsza. Nadal masz obowiązek informacyjny i rejestr czynności przetwarzania. Znika za to obowiązek zbierania zgody na przechowywanie informacji w urządzeniu."}]
---

# Analityka bez cookies — jak mierzyć ruch bez banera zgód

**W skrócie:** analityka bez cookies zlicza odwiedziny, nie zapisując identyfikatorów w przeglądarce. Skoro nie przechowuje ani nie odczytuje informacji na urządzeniu użytkownika, **nie wymaga zgody na cookies** — działa bez banera i bez luk w danych. Nie znaczy to jednak, że nie przetwarza żadnych danych osobowych. Poniżej: co dokładnie zyskujesz, a czego ta technologia Ci nie załatwi.

## Dlaczego klasyczna analityka wymaga zgody

Narzędzia takie jak Google Analytics zapisują identyfikator w przeglądarce (cookie), by rozpoznać powracającego użytkownika. To przechowywanie informacji na urządzeniu końcowym, więc wymaga zgody — w Polsce reguluje to Prawo komunikacji elektronicznej, wdrażające art. 5(3) dyrektywy ePrivacy. Osobno przetwarzanie danych wymaga podstawy prawnej z RODO. Stąd baner.

Efekt uboczny: **część użytkowników odmawia**, więc Twoje dane są niepełne. Im więcej odmów, tym mniej wiesz — a Google uzupełnia lukę modelowaniem, którego dokładność zależy od wolumenu ruchu.

## Co mierzy analityka bez cookies

- liczbę odwiedzin i odsłon,
- najpopularniejsze strony,
- źródła ruchu (skąd przyszli),
- kraj, typ urządzenia, przeglądarkę — zagregowane.

Czego **nie** zmierzy: precyzyjnej ścieżki konkretnej osoby przez wiele sesji ani szczegółowego profilowania. Dla większości stron firmowych to informacja, której i tak nie wykorzystywały.

## Czego ta technologia NIE załatwia

Tu jest miejsce, w którym wiele materiałów marketingowych przesadza — łącznie z tym, co sami pisaliśmy wcześniej.

**„Bez danych osobowych" to nadużycie.** Żeby zliczyć odwiedziny, serwer musi zobaczyć adres IP. Adres IP jest daną osobową w rozumieniu RODO (potwierdził to TSUE w sprawie Breyer, C-582/14). Dobre narzędzia cookieless natychmiast go haszują lub skracają i nie przechowują — ale samo przetworzenie już nastąpiło. Potrzebujesz więc podstawy prawnej, najczęściej prawnie uzasadnionego interesu (art. 6 ust. 1 lit. f RODO), i testu równowagi.

**Obowiązki RODO nie znikają, tylko maleją.** Nadal obowiązuje Cię klauzula informacyjna i rejestr czynności przetwarzania. Odpada zgoda z PKE i cały aparat zarządzania nią.

**Baner i tak może być potrzebny.** Jeśli używasz remarketingu, Meta Pixela albo Google Ads, te narzędzia wymagają zgody niezależnie od tego, czym mierzysz ruch. Analityka bez cookies **zmniejsza** tylko zakres tego, co musisz uzasadniać.

Szerzej o obowiązkach: [RODO a hosting](/blog/rodo-a-hosting).

## Co realnie zyskujesz

- **Brak banera zgód dla samej analityki** — mniej tarcia, mniej porzuceń na wejściu.
- **Kompletniejsze dane** — nikt nie odmawia, bo nie ma czego odmawiać.
- **Mniej dokumentacji** — brak zgody do zbierania, przechowywania i wycofywania.
- **Szybsza strona** — bez zewnętrznych skryptów śledzących w krytycznej ścieżce renderowania.

## Jak zacząć

Sprawdzone narzędzia cookieless, które możesz uruchomić samodzielnie: **Umami** (licencja MIT, lekki, łatwy w self-hostingu), **Plausible Community Edition** (AGPL, bogatsze raporty, cięższy stack) oraz **Matomo** w trybie bez cookies. Wszystkie trzy działają na własnym serwerze, więc dane nie opuszczają Twojej infrastruktury.

Niezależnie od wyboru zrób trzy rzeczy: wyłącz przechowywanie pełnych adresów IP, opisz analitykę w polityce prywatności i wykonaj test równowagi dla prawnie uzasadnionego interesu.

## FAQ

**Czy to zastąpi Google Analytics?**
Do podstawowych decyzji (co czytają, skąd przychodzą) — tak. Do atrybucji kampanii reklamowych i remarketingu — nie.

**Czy naprawdę nie potrzebuję zgody?**
Jeśli narzędzie nie zapisuje ani nie odczytuje informacji na urządzeniu — zgoda z PKE nie jest wymagana. Nadal jednak przetwarzasz adres IP, więc potrzebujesz podstawy z RODO. Warto potwierdzić to z własnym IOD lub prawnikiem.

**Czy analityka bez cookies zdejmuje obowiązki RODO?**
Nie zdejmuje, tylko zmniejsza. Zostaje obowiązek informacyjny i rejestr czynności. Znika zgoda na przechowywanie informacji w urządzeniu.

---

*Hosting, na którym postawisz własną analitykę bez oddawania danych komukolwiek — [zobacz hosting Verris](/hosting).*

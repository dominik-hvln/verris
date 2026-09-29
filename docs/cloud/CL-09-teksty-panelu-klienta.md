# CL-09 — teksty panelu klienta: żargon, niejasności, odmiana

Lista z przeglądu 30.09.2026 (sesja z dostępem do węzła). Przecieki białej etykiety (nazwy serwerów,
adresy sond, surowe statusy, surowe opisy transakcji, „panel hostingu”, CloudLinux) są już poprawione —
tu zostało to, co klient rozumie źle albo wcale. Ścieżki względem `apps/client-panel/src/`.
Numery linii z dnia przeglądu — szukaj po tekście.

Zasady: język klienta hostingu, bez nazw naszych mechanizmów; funkcje klienta (SSH, cron, API, webhooki,
Git, Redis, WAF, PHP, phpMyAdmin) zostają nazwane po imieniu. Liczebniki przez `plForm`/`plural`
(`lib/pl.ts`). Strażnik `lib/biala-etykieta.spec.ts` musi zostać zielony.

## Żargon wewnętrzny
- `app/dashboard/services-health-overview.tsx:24` „Provisioning wymaga uwagi” → „Zakładanie konta wymaga uwagi — napisz do nas”.
- `app/dashboard/vps/vps-client.tsx:353` „Provisioning nie powiódł się…” → „Nie udało się utworzyć serwera — środki zwróciliśmy do portfela.”
- `components/hosting/ServiceOverviewTab.tsx:252` „Dashboard usługi hostingowej” → „Przegląd usługi”; `:280` „Health score” → „Stan usługi”; `:516` „Usage, backup i badge uptime →” → „Zużycie, kopie i odznaka dostępności →”; `:552` „Ustaw autoscaling” → „Ustaw autoskalowanie”.
- `app/dashboard/billing/page.tsx:68` „(po potwierdzeniu webhooka)” → „(gdy operator płatności potwierdzi wpłatę)”.
- `app/dashboard/billing/billing-extras-forms.tsx:215` „(Stripe, off-session)” → „pobierzemy kwotę z zapisanej karty”; `:277` „domyślna przy Stripe Checkout” → „Automatycznie — domyślna karta”.
- `app/dashboard/services/new/form.tsx:440` „(Stripe Subscriptions)” → „Karta obciążana automatycznie co miesiąc lub rok.”
- `form.tsx:334` „Limity zasobów są egzekwowane na serwerze — autoskalowanie dokupuje dodatkową moc godzinowo” → „Plan ma stałe limity. Autoskalowanie w razie potrzeby dokłada mocy, rozliczając ją w 15-minutowych blokach z portfela.” (sprawdź w `autoscaling/form.tsx`, że bloki są 15-minutowe).
- `app/dashboard/services/[id]/plan/form.tsx:325` „delty autoskalowania zostaną zresetowane” → „dodatkowe zasoby z autoskalowania wrócą do limitów nowego planu”.
- `app/dashboard/services/[id]/autoscaling/form.tsx:129` „silnik nie zwiększy” → „nie dołożymy więcej zasobów”.
- `autoscaling/timeline.tsx:84-87` „Serwer dał mniej zasobów… brak miejsca po naszej stronie” → „Przyznaliśmy mniej zasobów, niż potrzebowała strona (chwilowe obciążenie serwera). Płacisz tylko za to, co faktycznie przyznaliśmy.”
- `app/dashboard/settings/privacy-tab.tsx:223-224` „paczkę .ndjson.gz… (profil, faktury, tickety, audyt logów)” → „plik z wszystkimi danymi (profil, faktury, zgłoszenia, historia działań)”; `:206` „zakolejkowany” → „Przygotowujemy eksport…”; `:39` „Ręczne (admin)” → „Dodane przez obsługę”.
- `app/(auth)/login/actions.ts:44,90,98` „Brak tokenu 2FA”, „Brak tokenu sesji w odpowiedzi”, `:51,69` „Nieoczekiwana odpowiedź serwera” → „Nie udało się zalogować — spróbuj ponownie.”; „Brak tokenu w linku” (verify-email, reset-password, confirm-email-change) → „Link jest niepełny — otwórz go ponownie z wiadomości e-mail.”
- `components/hosting/hosting-offsite-panel.tsx:196` „Serwer pracuje nad kopią off-site…” → „Przygotowujemy kopię zapasową z drugiej lokalizacji…”; `:143` „nocnym przebiegu” → „dzisiejszej nocy”; `:132` usuń „(off-site)”.
- `app/dashboard/migrations/migration-progress.tsx:282` „Dograj różnice (delta-sync)” i `migration-wizard.tsx:276` „funkcją delta-sync” → „Dograj nowe pliki i pocztę”; `migration-progress.tsx:225` „ponawiam (x/y)” → „ponawiamy próbę (x z y)”.
- `components/hosting/HostingSslForms.tsx:113` „walidacja DNS-01” → „Wymaga, aby DNS domeny był u nas (Verris).”; `:141` usuń „(w tle)”.
- `app/dashboard/dns/dns-manager.tsx:87` „z presetu” → „z zestawu”; `components/hosting/CronTab.tsx:143` „gotowego presetu” → „gotowego ustawienia”.
- `app/dashboard/domains/[id]/domain-record-actions.tsx:37` „Checklist DNS/SSL nie powiódł się” → „Nie udało się sprawdzić DNS i SSL”; `:34` „Asystent domeny zapisał nowy wynik” → „Sprawdziliśmy domenę — wynik poniżej.”
- `app/dashboard/iam/page.tsx:36` „po włączeniu modułu IAM w ofercie” → „Dostęp dla współpracowników będzie dostępny wkrótce.”; `iam-audit-section.tsx:19` „Audyt IAM” → „Historia dostępu”.
- `autoscaling/eco-mode-card.tsx:27-28` „mniej agresywne kopie”, „pełny rytm utrzymaniowy” → „Kopie raz w tygodniu zamiast codziennie”, „Kopie codziennie (standard)” (sprawdź w kodzie, jaki rytm faktycznie jest); `form.tsx:523` „kopie platformy bez zmian” → „nasze kopie awaryjne bez zmian”.
- `app/dashboard/eco/eco-program-status.tsx:61` „panel może mieć delikatny zielony akcent” — notatka programisty, usuń.
- `app/dashboard/support/[id]/client-ticket-chat.tsx:118,210` „do administracji” → „do zespołu wsparcia”.
- `app/dashboard/services/new/page.tsx:67` „Administrator nie opublikował jeszcze planów” → „Plany są chwilowo niedostępne. Spróbuj za chwilę lub napisz do nas.”
- `components/hosting/WpOverviewPanel.tsx:90` „automat włączony/wyłączony” → „auto-aktualizacje: wł./wył.”
- Kod HTTP w komunikatach `(${err.status})`: `services/page.tsx:62`, `services/new/page.tsx:18`, `billing/page.tsx:47`, `billing/invoices/page.tsx:28`, `analytics/page.tsx:16`, `email-marketing/page.tsx:16` → bez kodu: „Nie udało się pobrać … Odśwież stronę za chwilę.”

## Niejasne dla klienta
- `components/hosting/BackupScheduleCard.tsx:89` „Godzina (UTC)” → czas polski (przelicz przy zapisie i odczycie, test na zmianę czasu); `:101` „Trzymaj kopii” → „Ile kopii przechowywać”; `:48` „backupy” → „kopie zapasowe”.
- `hosting-offsite-panel.tsx:181` „Dzień kopii (RRRRMMDD)” → `<input type="date">` (format do API bez zmian); `:173` „Szukam kopii z konkretnego dnia” → „Znajdź kopię z wybranego dnia”.
- `components/hosting/StagingTab.tsx:206` „(zakładka Bazy MySQL)” → „(zakładka Bazy danych)”; „produkcja” → „wersja publiczna strony”.
- Jednostka „K” bez wyjaśnienia: `MonitoringTab.tsx:236,265,275`, `domains/[id]/domain-renew-box.tsx:64`, `eco/page.tsx:80`, `form.tsx:452` → `formatCredits` (jednolita jednostka) albo „zł … z portfela”.
- `domains/[id]/page.tsx:144` „Domena w portfelu Verris” → „Domena na Twoim koncie Verris”; `domain-record-actions.tsx:44,92` „z portfolia” → „Usuń z konta”.
- „Domeny & DNS” (`form.tsx:827`, `HealthCheckDetails.tsx:128`, `FirstStepsAssistant.tsx:50`) → „Domeny i DNS” (jak w `services/[id]/tabs.ts`).
- `components/hosting/WafTab.tsx:127,176` „BOK” → „napisz do nas (Centrum pomocy)”.
- `CronTab.tsx:175` placeholder `php /home/user/domains/…` → `php ~/domains/twojadomena.pl/public_html/cron.php`.

## Angielskie resztki i odmiana
- „Badge na stronę” (`services/[id]/tabs.ts:32`), „badge”, „loaderem” (`BadgesTab.tsx`), `eco/page.tsx:116,142,178` → „Odznaka na stronę”, „odznaka”, „mały skrypt”.
- `settings/sidebar-tiles-section.tsx:43,59` „Skróty w sidebarze” → „Skróty w menu”; `settings/page.tsx:620` „Dane bilingowe” → „Dane do faktury”; `referral/referral-program-client.tsx:182` „(recurring)” → „(od każdej kolejnej płatności)”; `services/new/order-flow.tsx:155` „Snapshoty” → „Kopie migawkowe”.
- Odmiana (dwie formy zamiast `plForm`): `LogsTab.tsx:173` (wpis), `services-health-overview.tsx:86,98` (usługa, sprawa), `settings/two-factor-section.tsx:142` („Pozostało/Pozostały N kod/kody/kodów zapasowych”), `reseller/reseller-klient.tsx:110` (usługa), `ServiceOverviewV2.tsx:353` (kopia), `services/[id]/sites/[domain]/page.tsx:294` (skrzynka), `domains/components/domain-purchase-wizard.tsx:639` (rok), `order-flow.tsx:307` („warianty/ów” → `plural(count, 'wariant', 'warianty', 'wariantów')`).

## Gotowe gdy
Lista w PR (plik:linia, przed → po), testy odmiany dla zmienionych miejsc, bramki client-panel zielone.
Teksty z API (opisy stanu usługi, podpowiedzi) poza zakresem — jeśli trafisz na żargon w `apps/api/src`, wypisz w PR.

-- Q-05 — pakiety e-mail marketingu („Newsletter”) zaczynają istnieć w bazie.
--
-- Moduł e-mail marketingu działał, ale nie dało się go kupić: nie było planu
-- productKind = EMAIL_MARKETING. Cennik (decyzja 2026-10-05), ceny BRUTTO:
--   Newsletter Start — 19 zł/mies., 190 zł/rok; 1 000 kontaktów; 5 000 wysyłek/mies.
--   Newsletter Plus  — 49 zł/mies., 490 zł/rok; 5 000 kontaktów; 25 000 wysyłek/mies.
--
-- Produkt aplikacyjny: bez konta na węźle i bez pakietu DirectAdmina. Pola zasobów
-- hostingu mają wartości neutralne (dodatnie — wymagają tego niezmienniki po migracji).
--
-- ON CONFLICT DO NOTHING bez wskazania kolumny: łapie też konflikt na "slug", gdyby
-- admin założył już z panelu plan o tej nazwie — wtedy migracja nie wywraca wdrożenia.
--
-- Wartości muszą być identyczne z apps/api/src/plans/plany-newsletter.ts — pilnuje
-- tego test plany-newsletter.spec.ts, który parsuje ten plik.

INSERT INTO "Plan" (
    "id",
    "slug",
    "name",
    "description",
    "cpuLimit",
    "ramLimitMb",
    "diskLimitMb",
    "ioLimitKbps",
    "iopsLimit",
    "entryProcesses",
    "nprocLimit",
    "includedTransferGb",
    "priceMonthly",
    "priceYearly",
    "currency",
    "isPublic",
    "isActive",
    "sortOrder",
    "trialDays",
    "productKind",
    "emmMaxContacts",
    "emmMonthlySends",
    "supportSlaHours",
    "sshAccess",
    "autoscalingMaxOverscaleCpu",
    "autoscalingMaxOverscaleRam",
    "autoscalingMaxOverscaleDisk",
    "createdAt",
    "updatedAt"
) VALUES (
    'c749b96a-cc1e-4854-bbfd-6f8bf1771d99',
    'newsletter-start',
    'Newsletter Start',
    'Do 1 000 kontaktów i 5 000 wysyłek miesięcznie. Listy z potwierdzeniem zapisu (double opt-in), kampanie z panelu, wypis jednym kliknięciem.',
    1, 1, 1, 1, 1, 1, 17,
    NULL,
    19.00,
    190.00,
    'PLN',
    true,
    true,
    20,
    0,
    'EMAIL_MARKETING',
    1000,
    5000,
    0,
    false,
    1, 1, 1,
    NOW(),
    NOW()
), (
    '38b2ece5-4baf-436d-9260-4a0ffd21a92b',
    'newsletter-plus',
    'Newsletter Plus',
    'Do 5 000 kontaktów i 25 000 wysyłek miesięcznie. Listy z potwierdzeniem zapisu (double opt-in), kampanie z panelu, wypis jednym kliknięciem.',
    1, 1, 1, 1, 1, 1, 17,
    NULL,
    49.00,
    490.00,
    'PLN',
    true,
    true,
    21,
    0,
    'EMAIL_MARKETING',
    5000,
    25000,
    0,
    false,
    1, 1, 1,
    NOW(),
    NOW()
)
ON CONFLICT DO NOTHING;

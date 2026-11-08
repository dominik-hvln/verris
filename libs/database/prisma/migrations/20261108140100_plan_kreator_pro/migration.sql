-- Paczka 121 — plan abonamentu Verris Kreator Pro (decyzja właściciela 8.11.2026), ceny BRUTTO:
--   9,90 zł/mies. (8,05 zł netto), 99 zł/rok (80,49 zł netto); VAT 23% liczy faktura (rozbicieVat).
--
-- Produkt aplikacyjny jak pakiety Newsletter (20261005140000_plany_newsletter): bez konta na węźle i bez
-- pakietu DirectAdmina. Pola zasobów hostingu mają wartości neutralne (dodatnie — niezmienniki po migracji).
-- Ceny Stripe (karta) zakłada administrator: Plany → Verris Kreator Pro → zapis (synchronizacja ze Stripe).
--
-- ON CONFLICT DO NOTHING bez wskazania kolumny: łapie też konflikt na "slug".
--
-- Wartości muszą być identyczne z apps/api/src/plans/plan-kreator-pro.ts — pilnuje tego test
-- plan-kreator-pro.spec.ts, który parsuje ten plik.

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
    "supportSlaHours",
    "sshAccess",
    "autoscalingMaxOverscaleCpu",
    "autoscalingMaxOverscaleRam",
    "autoscalingMaxOverscaleDisk",
    "createdAt",
    "updatedAt"
) VALUES (
    'e0b2ca4c-8c80-4fd5-a740-40d5693ecf14',
    'kreator-pro',
    'Verris Kreator Pro',
    'Rozszerzona wersja Verris Kreatora: 3 propozycje projektu z każdej generacji, sekcje sklepu i bloga, interakcje i animacje, pełne SEO, wersje językowe i wyższe limity. Wymaga płatnego hostingu Verris.',
    1, 1, 1, 1, 1, 1, 17,
    NULL,
    9.90,
    99.00,
    'PLN',
    true,
    true,
    30,
    0,
    'KREATOR_PRO',
    0,
    false,
    1, 1, 1,
    NOW(),
    NOW()
)
ON CONFLICT DO NOTHING;

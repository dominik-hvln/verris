-- Z-13 — pakiet sprzedawany na stronie zaczyna istnieć w bazie.
--
-- Strona sprzedaje 45 zł/mies. (399 zł/rok) z bazą 50 GB NVMe, do 8 GB RAM
-- i do 2 vCPU. W bazie były wyłącznie trzy plany z czasów prototypu
-- (starter / pro / business, 19,99 / 49,99 / 99,99 zł) o innych limitach.
--
-- Z rekordu Plan czyta wycena zamówienia, placement konta na węźle,
-- synchronizacja pakietów DirectAdmina i sufity autoskalowania. Bez niego nie
-- dało się kupić tego, co reklamuje strona.
--
-- CENY SĄ BRUTTO. invoices.service.ts traktuje kwotę obciążenia jako brutto
-- i rozbija ją na netto + VAT 23%. Wpisanie netto zawyżyłoby faktury o 23%.
--
-- Wartości muszą być identyczne z apps/api/src/plans/plan-produkcyjny.ts —
-- pilnuje tego test plan-produkcyjny.spec.ts, który parsuje ten plik.

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
    '7f3a1c62-9b84-4d51-a0e7-2c5d8e14b903',
    'verris-hosting',
    'Hosting Verris z autoskalowaniem',
    'Jeden pakiet hostingu współdzielonego z autoskalowaniem. Baza 50 GB NVMe, do 8 GB RAM i do 2 vCPU; w piku zasoby rosną automatycznie i wracają po piku. Bez limitu stron, skrzynek i transferu w ramach zasobów konta.',
    200,
    8192,
    51200,
    40960,
    4096,
    80,
    100,
    NULL,
    45.00,
    399.00,
    'PLN',
    true,
    true,
    1,
    0,
    'HOSTING',
    0,
    false,
    12,
    8,
    20,
    NOW(),
    NOW()
)
ON CONFLICT ("id") DO UPDATE SET
    "slug"                       = EXCLUDED."slug",
    "name"                       = EXCLUDED."name",
    "description"                = EXCLUDED."description",
    "cpuLimit"                   = EXCLUDED."cpuLimit",
    "ramLimitMb"                 = EXCLUDED."ramLimitMb",
    "diskLimitMb"                = EXCLUDED."diskLimitMb",
    "ioLimitKbps"                = EXCLUDED."ioLimitKbps",
    "iopsLimit"                  = EXCLUDED."iopsLimit",
    "entryProcesses"             = EXCLUDED."entryProcesses",
    "nprocLimit"                 = EXCLUDED."nprocLimit",
    "includedTransferGb"         = EXCLUDED."includedTransferGb",
    "priceMonthly"               = EXCLUDED."priceMonthly",
    "priceYearly"                = EXCLUDED."priceYearly",
    "isPublic"                   = EXCLUDED."isPublic",
    "isActive"                   = EXCLUDED."isActive",
    "sortOrder"                  = EXCLUDED."sortOrder",
    "supportSlaHours"            = EXCLUDED."supportSlaHours",
    "sshAccess"                  = EXCLUDED."sshAccess",
    "autoscalingMaxOverscaleCpu"  = EXCLUDED."autoscalingMaxOverscaleCpu",
    "autoscalingMaxOverscaleRam"  = EXCLUDED."autoscalingMaxOverscaleRam",
    "autoscalingMaxOverscaleDisk" = EXCLUDED."autoscalingMaxOverscaleDisk",
    "updatedAt"                  = NOW();

-- Plany prototypowe znikają ze sprzedaży.
--
-- isActive NIE jest zerowane celowo: gdyby na którymś środowisku istniała
-- subskrypcja na tym planie, wyłączenie planu wywróciłoby jej odnowienie.
-- isPublic=false wystarcza, żeby plan zniknął z katalogu (plans.listPublic)
-- i z możliwości zakupu, a istniejące subskrypcje działają dalej.
UPDATE "Plan"
   SET "isPublic"  = false,
       "updatedAt" = NOW()
 WHERE "slug" IN ('starter', 'pro', 'business')
   AND "isPublic" = true;

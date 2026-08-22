import { PrismaClient, BillingInterval, AutoscalingResource, LegalDocumentKind } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Verris database...');

  // ---------------------------------------------------------------------------
  // Admin account (kept for development access only — change in production!)
  // ---------------------------------------------------------------------------
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@verris.pl' },
    update: {},
    create: {
      email: 'admin@verris.pl',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'Verris',
      role: 'ADMIN',
      walletBalance: 0,
      ecoPoints: 0,
    },
  });

  console.log(`  user: ${admin.email} (role=${admin.role})`);

  const staffPassword = process.env.SEED_STAFF_PASSWORD ?? adminPassword;
  const staffHashed = await bcrypt.hash(staffPassword, 10);
  const staffUser = await prisma.user.upsert({
    where: { email: 'staff@verris.pl' },
    update: {},
    create: {
      email: 'staff@verris.pl',
      passwordHash: staffHashed,
      firstName: 'Support',
      lastName: 'Verris',
      role: 'STAFF',
      walletBalance: 0,
      ecoPoints: 0,
    },
  });
  console.log(`  user: ${staffUser.email} (role=${staffUser.role})`);

  // ---------------------------------------------------------------------------
  // Plany prototypowe (Z-13)
  //
  // To są PRÓBKI z czasów prototypu, nie oferta. Pakiet, który Verris naprawdę
  // sprzedaje — 45 zł/mies., baza 50 GB / do 8 GB RAM / do 2 vCPU — powstaje
  // w migracji 20260822120000_plan_produkcyjny, żeby istniał na każdym
  // środowisku bez uruchamiania seeda. Definicja: apps/api/src/plans/plan-produkcyjny.ts
  //
  // isPublic=false: do 2026-08-22 te trzy plany były jedynymi publicznymi
  // i to je widział klient w katalogu, mimo że strona reklamowała zupełnie
  // inny pakiet za inną cenę.
  // ---------------------------------------------------------------------------
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { slug: 'starter' },
      update: {},
      create: {
        slug: 'starter',
        isPublic: false,
        name: 'Starter',
        description: 'Wszystko czego potrzebujesz, aby uruchomić małą stronę firmową lub blog.',
        cpuLimit: 100,
        ramLimitMb: 1024,
        diskLimitMb: 10240,
        ioLimitKbps: 10240,
        iopsLimit: 1024,
        entryProcesses: 30,
        nprocLimit: 46,
        includedTransferGb: 100,
        priceMonthly: 19.99,
        priceYearly: 199.99,
        sortOrder: 1,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'pro' },
      update: {},
      create: {
        slug: 'pro',
        isPublic: false,
        name: 'Pro',
        description: 'Dla rozwijających się projektów z wyższym ruchem i wymaganiami.',
        cpuLimit: 200,
        ramLimitMb: 2048,
        diskLimitMb: 25600,
        ioLimitKbps: 20480,
        iopsLimit: 2048,
        entryProcesses: 50,
        nprocLimit: 70,
        includedTransferGb: 500,
        priceMonthly: 49.99,
        priceYearly: 499.99,
        sortOrder: 2,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'business' },
      update: {},
      create: {
        slug: 'business',
        isPublic: false,
        name: 'Business',
        description: 'Wydajny pakiet dla sklepów online i aplikacji biznesowych.',
        cpuLimit: 400,
        ramLimitMb: 4096,
        diskLimitMb: 51200,
        ioLimitKbps: 40960,
        iopsLimit: 4096,
        entryProcesses: 80,
        nprocLimit: 100,
        includedTransferGb: 1500,
        priceMonthly: 99.99,
        priceYearly: 999.99,
        sortOrder: 3,
      },
    }),
  ]);

  console.log(`  plans: ${plans.map((p) => p.slug).join(', ')}`);

  // ---------------------------------------------------------------------------
  // Default autoscaling pricing (per hour, in PLN)
  // ---------------------------------------------------------------------------
  const priceRules = [
    {
      resource: AutoscalingResource.CPU,
      unit: 'cpu_pct',
      pricePerUnit: 0.0002, // ~0.02 zł / h za 100% CPU SPEED
    },
    {
      resource: AutoscalingResource.RAM,
      unit: 'ram_gb',
      pricePerUnit: 0.119808, // ~0.12 zł / h za 1 GB (ex 0.000117 / MB)
    },
    {
      resource: AutoscalingResource.DISK,
      unit: 'disk_gb',
      pricePerUnit: 0.05, // przykładowa stawka za 1 GB / h
    },
  ];

  for (const rule of priceRules) {
    const existing = await prisma.autoscalingPriceRule.findFirst({
      where: { resource: rule.resource, isActive: true },
    });
    if (!existing) {
      await prisma.autoscalingPriceRule.create({ data: rule });
    }
  }

  console.log(`  autoscaling price rules: ${priceRules.length}`);

  // ---------------------------------------------------------------------------
  // Sprint 1 — Legal documents (drafty 1.0.0-draft)
  //
  // Pierwsze wersje dokumentów prawnych są seedowane jako `1.0.0-draft` — w
  // produkcji Verris **NIE** publikuje ich do klientów (admin → Compliance →
  // panel publikacji ich nie pokazuje na rejestracji bo `isCurrent = false`).
  // Po lawyer review admin opublikuje `1.0.0` (zatwierdzona treść), drafty
  // staną się historyczne. Drafty służą wyłącznie testom integracyjnym
  // re-consent / settings flow + jako safety net, gdyby ktoś próbował
  // zarejestrować klienta przed lawyer review (constraint: brak dokumentu z
  // `isCurrent=true` zwraca 503 z message „Verris jeszcze nie publikuje
  // panelu" zamiast pozwolić na rejestrację bez podpisanej zgody).
  // ---------------------------------------------------------------------------
  const draftsDir = join(__dirname, '..', '..', '..', 'docs', 'legal', 'drafts');
  const legalDrafts = [
    {
      kind: LegalDocumentKind.TERMS,
      file: 'terms.md',
      title: 'Regulamin świadczenia usług hostingowych Verris',
    },
    {
      kind: LegalDocumentKind.PRIVACY,
      file: 'privacy.md',
      title: 'Polityka prywatności Verris',
    },
    {
      kind: LegalDocumentKind.COOKIES,
      file: 'cookies.md',
      title: 'Polityka plików cookies Verris',
    },
    {
      kind: LegalDocumentKind.DPA,
      file: 'dpa.md',
      title: 'Umowa powierzenia przetwarzania danych osobowych (DPA)',
    },
  ];

  for (const draft of legalDrafts) {
    const path = join(draftsDir, draft.file);
    let contentMarkdown: string;
    try {
      contentMarkdown = readFileSync(path, 'utf8');
    } catch {
      console.warn(`  legal draft missing: ${draft.file} — skipping`);
      continue;
    }

    await prisma.legalDocument.upsert({
      where: {
        kind_version_locale: {
          kind: draft.kind,
          version: '1.0.0-draft',
          locale: 'pl',
        },
      },
      create: {
        kind: draft.kind,
        version: '1.0.0-draft',
        locale: 'pl',
        title: draft.title,
        contentMarkdown,
        changelogMarkdown:
          'Pierwsza wersja dokumentu — przygotowany draft do lawyer review (Sprint 0). NIE PUBLIKUJ przed zatwierdzeniem przez prawnika.',
        // Drafty są DOMYŚLNIE niewidoczne dla klientów. Admin po lawyer review
        // dodaje wersję 1.0.0 z `isCurrent=true` i wtedy stronę pokaże się.
        isCurrent: false,
      },
      update: {
        // Re-import treści przy każdym seedzie żeby aktualne drafty z `docs/`
        // były odzwierciedlone w bazie testowej. NIE nadpisuj `isCurrent`.
        title: draft.title,
        contentMarkdown,
      },
    });
    console.log(`  legal draft seeded: ${draft.kind} v1.0.0-draft (locale=pl)`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

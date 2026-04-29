import { PrismaClient, BillingInterval, AutoscalingResource } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding EkoHost database...');

  // ---------------------------------------------------------------------------
  // Admin account (kept for development access only — change in production!)
  // ---------------------------------------------------------------------------
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ekohost.pl' },
    update: {},
    create: {
      email: 'admin@ekohost.pl',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'EkoHost',
      role: 'ADMIN',
      walletBalance: 0,
      ecoPoints: 0,
    },
  });

  console.log(`  user: ${admin.email} (role=${admin.role})`);

  const staffPassword = process.env.SEED_STAFF_PASSWORD ?? adminPassword;
  const staffHashed = await bcrypt.hash(staffPassword, 10);
  const staffUser = await prisma.user.upsert({
    where: { email: 'staff@ekohost.pl' },
    update: {},
    create: {
      email: 'staff@ekohost.pl',
      passwordHash: staffHashed,
      firstName: 'Support',
      lastName: 'EkoHost',
      role: 'STAFF',
      walletBalance: 0,
      ecoPoints: 0,
    },
  });
  console.log(`  user: ${staffUser.email} (role=${staffUser.role})`);

  // ---------------------------------------------------------------------------
  // Sample plans
  // ---------------------------------------------------------------------------
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { slug: 'starter' },
      update: {},
      create: {
        slug: 'starter',
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
      unit: 'ram_mb',
      pricePerUnit: 0.000117, // ~0.03 zł / h za 256 MB
    },
    {
      resource: AutoscalingResource.IO,
      unit: 'io_kbps',
      pricePerUnit: 0.00002,
    },
    {
      resource: AutoscalingResource.TRANSFER,
      unit: 'transfer_gb',
      pricePerUnit: 0.01, // 0.01 zł / GB
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

#!/usr/bin/env bash
# Naprawa pakietów DA na węźle (realne limity, bez u*) — uruchom na control-plane.
# Użycie: ./ops/scripts/prod-sync-server-da-packages.sh <serverId|hostname-fragment>
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TARGET="${1:?podaj serverId lub fragment hostname (np. node-pl-01)}"

SERVER_ID="$(bash ops/scripts/prod-db-exec.sh node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const t = process.argv[1];
p.server.findFirst({
  where: {
    OR: [
      { id: t },
      { hostname: { contains: t } },
      { name: { contains: t } },
    ],
  },
  select: { id: true },
})
  .then((s) => { if (!s) { console.error('server not found'); process.exit(2); } console.log(s.id); })
  .finally(() => p.\$disconnect());
" "$TARGET")"

echo "[sync-packages] serverId=$SERVER_ID"

bash ops/scripts/prod-db-exec.sh node -e "
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');

function deriveKey(passphrase) {
  return createHash('sha256').update(passphrase, 'utf8').digest();
}
function decryptWithKey(payload, key) {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid ciphertext');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const cipher = Buffer.from(parts[3], 'base64url');
  const { createDecipheriv } = require('crypto');
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(cipher), d.final()]).toString('utf8');
}

const { DirectAdminClient } = require('@verris/directadmin-sdk');

const PACKAGE_POLICY = {
  starter: { domains: 1, subdomains: 25, emailAccounts: 25, emailForwarders: 50, mailingLists: 5, autoresponders: 25, databases: 5, domainPointers: 5, ftpAccounts: 10 },
  pro: { domains: 10, subdomains: 100, emailAccounts: 200, emailForwarders: 'unlimited', mailingLists: 25, autoresponders: 100, databases: 25, domainPointers: 25, ftpAccounts: 50 },
  business: { domains: 'unlimited', subdomains: 'unlimited', emailAccounts: 'unlimited', emailForwarders: 'unlimited', mailingLists: 100, autoresponders: 'unlimited', databases: 'unlimited', domainPointers: 'unlimited', ftpAccounts: 'unlimited' },
};

function policy(slug) {
  return PACKAGE_POLICY[slug] || PACKAGE_POLICY.starter;
}

(async () => {
  const kms = process.env.APP_KMS_KEY;
  if (!kms) throw new Error('APP_KMS_KEY missing in api container');
  const key = deriveKey(kms);
  const prisma = new PrismaClient();
  const serverId = process.argv[1];
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server?.daPasswordEnc) throw new Error('DA not configured for server');
  const loginKey = decryptWithKey(server.daPasswordEnc, key);
  const client = new DirectAdminClient({
    host: server.daHost,
    port: server.daPort,
    username: server.daUsername,
    loginKey,
    secure: server.daUseTls,
  });
  const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  for (const plan of plans) {
    const pol = policy(plan.slug);
    const bw = plan.includedTransferGb > 0 ? plan.includedTransferGb * 1024 : 'unlimited';
    await client.upsertUserPackage({
      name: plan.slug,
      diskQuotaMb: plan.diskLimitMb,
      bandwidthMb: bw,
      domains: pol.domains,
      subdomains: pol.subdomains,
      emailAccounts: pol.emailAccounts,
      emailForwarders: pol.emailForwarders,
      mailingLists: pol.mailingLists,
      autoresponders: pol.autoresponders,
      databases: pol.databases,
      domainPointers: pol.domainPointers,
      ftpAccounts: pol.ftpAccounts,
      lve: {
        cpuPercent: plan.cpuLimit,
        memoryMb: plan.ramLimitMb,
        ioKbps: plan.ioLimitKbps,
        iops: plan.iopsLimit,
        entryProcesses: plan.entryProcesses,
        nproc: plan.nprocLimit,
      },
      cgroup: {
        cpuQuotaPercent: plan.cpuLimit,
        memoryHighMb: plan.ramLimitMb,
        memoryMaxMb: plan.ramLimitMb,
        ioReadBandwidthKbps: plan.ioLimitKbps,
        ioWriteBandwidthKbps: plan.ioLimitKbps,
        ioReadIops: plan.iopsLimit,
        ioWriteIops: plan.iopsLimit,
        tasksMax: plan.nprocLimit,
      },
      language: 'pl',
      skin: 'evolution',
    });
    console.log('[OK] synced package', plan.slug);
  }
  await prisma.\$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
" "$SERVER_ID"

echo "[sync-packages] done — sprawdź DA → Edytuj pakiet starter (quota/transfer nie „Bez ograniczeń”)."

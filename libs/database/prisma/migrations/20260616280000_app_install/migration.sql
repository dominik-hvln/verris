-- P-3 — 1-click app marketplace (Nextcloud / PrestaShop) via APP_INSTALL task.
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'APP_INSTALL';

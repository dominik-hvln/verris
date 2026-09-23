-- Badge na stronę — liczba kliknięć w link polecający z badge'a „działa na verris”.
ALTER TABLE "User" ADD COLUMN "badgeReferralClicks" INTEGER NOT NULL DEFAULT 0;

-- PROD-02 — baner „Pierwsze kroki" schowany per konto, a nie per przeglądarka
-- (dotąd localStorage `verris_onboarding_dismissed_v1`: zamknięty na laptopie
-- wracał na telefonie, zamknięty przez pomyłkę nie wracał nigdy).
ALTER TABLE "User" ADD COLUMN "onboardingHidden" BOOLEAN NOT NULL DEFAULT false;

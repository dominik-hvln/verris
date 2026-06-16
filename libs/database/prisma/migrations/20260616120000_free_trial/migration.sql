-- O-1 Free trial.
--
-- A plan with `trialDays > 0` can be started for free. A trial subscription is
-- a normal Subscription with `isTrial = true`, price 0, and `trialEndsAt` set.
-- Abuse guard: one trial per user account (`User.trialStartedAt`). The trial
-- expiry scheduler reminds before, then suspends + EXPIREs when the window ends.

ALTER TABLE "Plan"
  ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Subscription"
  ADD COLUMN "isTrial"             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trialConvertedAt"    TIMESTAMP(3),
  ADD COLUMN "trialReminderSentAt" TIMESTAMP(3);

ALTER TABLE "User"
  ADD COLUMN "trialStartedAt" TIMESTAMP(3);

-- Fast lookup for the expiry scheduler.
CREATE INDEX "Subscription_isTrial_trialEndsAt_idx"
  ON "Subscription" ("isTrial", "trialEndsAt");

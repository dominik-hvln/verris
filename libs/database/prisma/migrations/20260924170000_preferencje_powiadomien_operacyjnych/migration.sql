-- N-10: powiadomienia operacyjne sterowane przez klienta (domyślnie włączone).
ALTER TABLE "MarketingPreferences" ADD COLUMN "autoscalingEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MarketingPreferences" ADD COLUMN "quotaAlertsEmail" BOOLEAN NOT NULL DEFAULT true;

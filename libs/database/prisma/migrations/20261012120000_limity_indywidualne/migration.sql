-- K3 (PB-53.5, F3.5 „limity custom”) — limity indywidualne usługi ustawiane przez administratora: dysk (MB), transfer
-- miesięczny (GB), domeny, skrzynki e-mail, bazy danych. JSON z polami nadpisującymi plan; NULL = limity planu.
-- Addytywna i idempotentna (kolumna dopuszcza NULL, bez wartości domyślnej). Stary kod kolumny nie czyta ani nie pisze,
-- więc kolejność „migrate deploy, potem kod” jest bezpieczna.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "limitOverrides" JSONB;

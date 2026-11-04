-- P3-10 — współpracownik akceptuje regulamin i politykę prywatności na ekranie aktywacji subkonta
-- (link z zaproszenia), a nie w oknie ponownej akceptacji po pierwszym logowaniu.
ALTER TYPE "ConsentSource" ADD VALUE IF NOT EXISTS 'SUBACCOUNT_ACTIVATION';

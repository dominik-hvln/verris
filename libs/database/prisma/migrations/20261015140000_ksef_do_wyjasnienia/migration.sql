-- Decyzja 15.10 (#3): wysyłka do KSeF bez odpowiedzi — faktura „do wyjaśnienia” zamiast ponownej wysyłki.
ALTER TYPE "KsefStatus" ADD VALUE IF NOT EXISTS 'UNCERTAIN';

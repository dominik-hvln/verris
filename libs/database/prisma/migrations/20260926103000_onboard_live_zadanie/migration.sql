-- PB-31: Onboard LIVE jako zadanie agenta
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'ONBOARD_LIVE';

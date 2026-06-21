-- BILL-1 — rabat startowy (pierwsze N okresów) zapisywany na subskrypcji.
-- introDiscountPct: % rabatu startowego naliczony przy zakupie (0 = brak).
-- introDiscountPeriodsLeft: ile kolejnych odnowień ma jeszcze iść z rabatem
--   startowym; po wyzerowaniu odnowienia idą pełną ceną listową.
ALTER TABLE "Subscription" ADD COLUMN "introDiscountPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "introDiscountPeriodsLeft" INTEGER NOT NULL DEFAULT 0;

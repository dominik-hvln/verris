-- PB-16 — widok (Prosty/Pełny) i motyw panelu klienta zapamiętane per
-- użytkownik, a nie per przeglądarka. NULL = użytkownik jeszcze nie wybrał:
-- panel wtedy zostawia to, co ma w przeglądarce, i odsyła ten wybór do API.
-- Domyślna wartość w kolumnie nadpisałaby przy pierwszym logowaniu wybór,
-- który klient już zrobił lokalnie.

ALTER TABLE "User"
  ADD COLUMN "panelViewMode" TEXT,
  ADD COLUMN "panelTheme"    TEXT;

-- DTO pilnuje wartości przy zapisie z API; baza pilnuje zawsze (ta sama zasada co M-06).
ALTER TABLE "User"
  ADD CONSTRAINT "User_panelViewMode_check" CHECK ("panelViewMode" IS NULL OR "panelViewMode" IN ('simple', 'full')),
  ADD CONSTRAINT "User_panelTheme_check"    CHECK ("panelTheme" IS NULL OR "panelTheme" IN ('dark', 'light'));

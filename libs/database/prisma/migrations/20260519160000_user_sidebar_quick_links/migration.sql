-- Personalizacja 4 kafelków w sidebarze panelu klienta
ALTER TABLE "User" ADD COLUMN "sidebarQuickLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

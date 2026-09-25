-- I-07 — podatności WordPressa (Wordfence Intelligence Scanner Feed v3).
CREATE TABLE "WpPodatnosc" (
    "id" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tytul" TEXT NOT NULL,
    "zakresy" JSONB NOT NULL,
    "poprawione" TEXT[],
    "link" TEXT NOT NULL,
    "opublikowano" TIMESTAMP(3),
    "aktualizacja" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WpPodatnosc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WpPodatnosc_typ_slug_idx" ON "WpPodatnosc"("typ", "slug");

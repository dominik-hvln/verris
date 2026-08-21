import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Samodzielnie tworzy schemat `payload`, żeby migracja działała na świeżej bazie
  // bez ręcznego `CREATE SCHEMA` (adapter tego nie robi w trybie migracji).
  await db.execute(sql`
   CREATE SCHEMA IF NOT EXISTS "payload";
   CREATE TYPE "payload"."_locales" AS ENUM('pl');
  CREATE TYPE "payload"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_published_locale" AS ENUM('pl');
  CREATE TYPE "payload"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__posts_v_published_locale" AS ENUM('pl');
  CREATE TYPE "payload"."enum_services_icon" AS ENUM('server', 'terminal', 'globe', 'mail', 'users', 'move');
  CREATE TABLE "payload"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "payload"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar
  );

  CREATE TABLE "payload"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"hero_eyebrow" varchar,
  	"hero_heading" varchar,
  	"hero_lead" varchar,
  	"content" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_og_image_id" integer,
  	"seo_noindex" boolean,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_pages_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_hero_eyebrow" varchar,
  	"version_hero_heading" varchar,
  	"version_hero_lead" varchar,
  	"version_content" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_og_image_id" integer,
  	"version_seo_noindex" boolean,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__pages_v_published_locale",
  	"latest" boolean
  );

  CREATE TABLE "payload"."posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"excerpt" varchar,
  	"cover_image_id" integer,
  	"content" jsonb,
  	"published_at" timestamp(3) with time zone,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_og_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_posts_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_excerpt" varchar,
  	"version_cover_image_id" integer,
  	"version_content" jsonb,
  	"version_published_at" timestamp(3) with time zone,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_og_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__posts_v_published_locale",
  	"latest" boolean
  );

  CREATE TABLE "payload"."services" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"icon" "payload"."enum_services_icon" DEFAULT 'server',
  	"summary" varchar NOT NULL,
  	"price_label" varchar,
  	"cta_label" varchar DEFAULT 'Dowiedz się więcej →',
  	"cta_href" varchar DEFAULT 'https://panel.verris.pl',
  	"highlighted" boolean,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );

  CREATE TABLE "payload"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"pages_id" integer,
  	"posts_id" integer,
  	"services_id" integer
  );

  CREATE TABLE "payload"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );

  CREATE TABLE "payload"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"brand_name" varchar DEFAULT 'Verris',
  	"tagline" varchar DEFAULT 'Skaluj świadomie.',
  	"claim" varchar DEFAULT 'Hosting bez gwiazdek.',
  	"announce" varchar,
  	"default_seo_title" varchar,
  	"default_seo_description" varchar,
  	"default_seo_og_image_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."navigation_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );

  CREATE TABLE "payload"."navigation" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"cta_label" varchar DEFAULT 'Załóż konto',
  	"cta_href" varchar DEFAULT 'https://panel.verris.pl',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );

  CREATE TABLE "payload"."footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL
  );

  CREATE TABLE "payload"."footer" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"legal_line" varchar DEFAULT '© 2026 Verris · Operator: HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367',
  	"pay_line" varchar DEFAULT 'Płatności: karta · BLIK · Apple Pay · Google Pay · Stripe · Faktury gotowe na KSeF · SLA 99,5% z rekompensatami wg regulaminu',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."pricing_resources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"base" varchar NOT NULL,
  	"max" varchar
  );

  CREATE TABLE "payload"."pricing_feature_groups_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar NOT NULL
  );

  CREATE TABLE "payload"."pricing_feature_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"group" varchar NOT NULL
  );

  CREATE TABLE "payload"."pricing" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"plan_name" varchar DEFAULT 'Hosting Verris z autoskalowaniem',
  	"price_monthly" numeric DEFAULT 39,
  	"price_yearly" numeric DEFAULT 349,
  	"note" varchar DEFAULT '„Bez limitu" oznacza brak sztywnego licznika — realnym ogranicznikiem są zasoby konta (CPU/RAM/dysk) i zasady uczciwego korzystania. Autoskalowanie ponad bazę rozliczane jest godzinowo według stawek z cennika.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."posts" ADD CONSTRAINT "posts_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."posts" ADD CONSTRAINT "posts_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v" ADD CONSTRAINT "_posts_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v" ADD CONSTRAINT "_posts_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "payload"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "payload"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_settings" ADD CONSTRAINT "site_settings_default_seo_og_image_id_media_id_fk" FOREIGN KEY ("default_seo_og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."navigation_links" ADD CONSTRAINT "navigation_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns_links" ADD CONSTRAINT "footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns" ADD CONSTRAINT "footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pricing_resources" ADD CONSTRAINT "pricing_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pricing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pricing_feature_groups_items" ADD CONSTRAINT "pricing_feature_groups_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pricing_feature_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pricing_feature_groups" ADD CONSTRAINT "pricing_feature_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pricing"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "payload"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "payload"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "payload"."media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "payload"."media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "payload"."media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "payload"."media" USING btree ("sizes_hero_filename");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "pages_seo_seo_og_image_idx" ON "payload"."pages" USING btree ("seo_og_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "payload"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "payload"."pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "payload"."pages" USING btree ("_status");
  CREATE INDEX "_pages_v_parent_idx" ON "payload"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "payload"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_seo_version_seo_og_image_idx" ON "payload"."_pages_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "payload"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "payload"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "payload"."_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "payload"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "payload"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "payload"."_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "payload"."_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "payload"."_pages_v" USING btree ("latest");
  CREATE UNIQUE INDEX "posts_slug_idx" ON "payload"."posts" USING btree ("slug");
  CREATE INDEX "posts_cover_image_idx" ON "payload"."posts" USING btree ("cover_image_id");
  CREATE INDEX "posts_seo_seo_og_image_idx" ON "payload"."posts" USING btree ("seo_og_image_id");
  CREATE INDEX "posts_updated_at_idx" ON "payload"."posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "payload"."posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "payload"."posts" USING btree ("_status");
  CREATE INDEX "_posts_v_parent_idx" ON "payload"."_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "payload"."_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_cover_image_idx" ON "payload"."_posts_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_posts_v_version_seo_version_seo_og_image_idx" ON "payload"."_posts_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "payload"."_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "payload"."_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "payload"."_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "payload"."_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "payload"."_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_snapshot_idx" ON "payload"."_posts_v" USING btree ("snapshot");
  CREATE INDEX "_posts_v_published_locale_idx" ON "payload"."_posts_v" USING btree ("published_locale");
  CREATE INDEX "_posts_v_latest_idx" ON "payload"."_posts_v" USING btree ("latest");
  CREATE INDEX "services_updated_at_idx" ON "payload"."services" USING btree ("updated_at");
  CREATE INDEX "services_created_at_idx" ON "payload"."services" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_services_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("services_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload"."payload_migrations" USING btree ("created_at");
  CREATE INDEX "site_settings_default_seo_default_seo_og_image_idx" ON "payload"."site_settings" USING btree ("default_seo_og_image_id");
  CREATE INDEX "navigation_links_order_idx" ON "payload"."navigation_links" USING btree ("_order");
  CREATE INDEX "navigation_links_parent_id_idx" ON "payload"."navigation_links" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_links_order_idx" ON "payload"."footer_columns_links" USING btree ("_order");
  CREATE INDEX "footer_columns_links_parent_id_idx" ON "payload"."footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_order_idx" ON "payload"."footer_columns" USING btree ("_order");
  CREATE INDEX "footer_columns_parent_id_idx" ON "payload"."footer_columns" USING btree ("_parent_id");
  CREATE INDEX "pricing_resources_order_idx" ON "payload"."pricing_resources" USING btree ("_order");
  CREATE INDEX "pricing_resources_parent_id_idx" ON "payload"."pricing_resources" USING btree ("_parent_id");
  CREATE INDEX "pricing_feature_groups_items_order_idx" ON "payload"."pricing_feature_groups_items" USING btree ("_order");
  CREATE INDEX "pricing_feature_groups_items_parent_id_idx" ON "payload"."pricing_feature_groups_items" USING btree ("_parent_id");
  CREATE INDEX "pricing_feature_groups_order_idx" ON "payload"."pricing_feature_groups" USING btree ("_order");
  CREATE INDEX "pricing_feature_groups_parent_id_idx" ON "payload"."pricing_feature_groups" USING btree ("_parent_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Rollback: usuwa cały schemat Payloada (nie dotyka tabel Prisma).
  await db.execute(sql`DROP SCHEMA IF EXISTS "payload" CASCADE;`);
}

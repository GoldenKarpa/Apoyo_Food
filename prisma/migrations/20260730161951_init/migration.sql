-- CreateEnum
CREATE TYPE "region_key" AS ENUM ('north_west', 'east_west_corridor', 'central', 'south_central', 'south_west', 'north_east', 'south_east', 'tobago');

-- CreateEnum
CREATE TYPE "seller_status" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "listing_kind" AS ENUM ('SINGLE_ITEM', 'MENU', 'PACKAGE', 'TRAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "price_mode" AS ENUM ('FIXED', 'STARTING_AT', 'QUOTE');

-- CreateEnum
CREATE TYPE "availability_type" AS ENUM ('PREORDER', 'RECURRING_WEEKLY', 'DATE_RANGE');

-- CreateEnum
CREATE TYPE "fulfillment_mode" AS ENUM ('PICKUP', 'SELLER_DELIVERY', 'MEETUP');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'DECLINED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SELLER', 'EXPIRED');

-- CreateEnum
CREATE TYPE "demand_event_kind" AS ENUM ('SEARCH', 'LISTING_VIEW', 'PROFILE_VIEW', 'SAVE', 'FOLLOW', 'ORDER_PLACED', 'STORY_VIEW');

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('ORDER_PLACED', 'ORDER_ACCEPTED', 'ORDER_DECLINED', 'ORDER_EXPIRED', 'ORDER_CANCELLED', 'ORDER_COMPLETED', 'ORDER_MESSAGE', 'ORDER_REMINDER', 'NEW_FOLLOWER', 'STORY_FROM_FOLLOWED');

-- CreateEnum
CREATE TYPE "attachment_kind" AS ENUM ('PHOTO');

-- CreateTable
CREATE TABLE "food_sellers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "profile_image_thumb" TEXT,
    "profile_image_card" TEXT,
    "profile_image_full" TEXT,
    "profile_image_blur" TEXT,
    "cover_image_thumb" TEXT,
    "cover_image_card" TEXT,
    "cover_image_full" TEXT,
    "cover_image_blur" TEXT,
    "areas" "region_key"[],
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "languages" TEXT[],
    "specialties" TEXT[],
    "status" "seller_status" NOT NULL DEFAULT 'PENDING',
    "fulfillment_modes" "fulfillment_mode"[],
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "last_story_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_seller_photos" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "path_thumb" TEXT NOT NULL,
    "path_card" TEXT NOT NULL,
    "path_full" TEXT NOT NULL,
    "blur_data_url" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_seller_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_es" TEXT NOT NULL,
    "hero_image" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "seasonal" BOOLEAN NOT NULL DEFAULT false,
    "occasion_tag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_listings" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "listing_kind" NOT NULL,
    "price_mode" "price_mode" NOT NULL,
    "price_cents" INTEGER,
    "feeds_count" INTEGER,
    "dietary_tags" TEXT[],
    "ingredient_tags" TEXT[],
    "occasion_tag" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_listing_photos" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "path_thumb" TEXT NOT NULL,
    "path_card" TEXT NOT NULL,
    "path_full" TEXT NOT NULL,
    "blur_data_url" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_listing_categories" (
    "listing_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "food_listing_categories_pkey" PRIMARY KEY ("listing_id","category_id")
);

-- CreateTable
CREATE TABLE "food_availability_windows" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "type" "availability_type" NOT NULL,
    "days_of_week" INTEGER,
    "starts_on" DATE,
    "ends_on" DATE,
    "lead_time_days" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_availability_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_stories" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "path_thumb" TEXT NOT NULL,
    "path_card" TEXT NOT NULL,
    "path_full" TEXT NOT NULL,
    "blur_data_url" TEXT NOT NULL,
    "caption" TEXT,
    "linked_listing_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "highlight_id" TEXT,

    CONSTRAINT "food_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_story_highlights" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cover_image" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_story_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_story_views" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_story_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_follows" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_saves" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'PENDING',
    "fulfillment_mode" "fulfillment_mode" NOT NULL,
    "fulfillment_at" TIMESTAMP(3) NOT NULL,
    "fulfillment_area_or_note" TEXT,
    "subtotal_cents" INTEGER,
    "customer_note" TEXT,
    "respond_by" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "cancellation_reason" TEXT,

    CONSTRAINT "food_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "title_snapshot" TEXT NOT NULL,
    "price_cents_snapshot" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,

    CONSTRAINT "food_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_order_messages" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "original_text" TEXT NOT NULL,
    "original_locale" TEXT NOT NULL,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "attachment_path" TEXT,
    "attachment_kind" "attachment_kind",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "food_order_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_demand_events" (
    "id" TEXT NOT NULL,
    "kind" "demand_event_kind" NOT NULL,
    "user_id_hash" TEXT,
    "area" "region_key",
    "query" TEXT,
    "query_normalized" TEXT,
    "result_count" INTEGER,
    "listing_id" TEXT,
    "seller_id" TEXT,
    "category_slug" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_demand_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_sellers_user_id_key" ON "food_sellers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_sellers_slug_key" ON "food_sellers"("slug");

-- CreateIndex
CREATE INDEX "food_sellers_status_idx" ON "food_sellers"("status");

-- CreateIndex
CREATE INDEX "food_sellers_status_last_story_at_idx" ON "food_sellers"("status", "last_story_at");

-- CreateIndex
CREATE INDEX "food_sellers_areas_idx" ON "food_sellers" USING GIN ("areas" array_ops);

-- CreateIndex
CREATE INDEX "food_seller_photos_seller_id_sort_order_idx" ON "food_seller_photos"("seller_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "food_categories_slug_key" ON "food_categories"("slug");

-- CreateIndex
CREATE INDEX "food_categories_sort_order_idx" ON "food_categories"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "food_listings_slug_key" ON "food_listings"("slug");

-- CreateIndex
CREATE INDEX "food_listings_seller_id_active_idx" ON "food_listings"("seller_id", "active");

-- CreateIndex
CREATE INDEX "food_listings_active_created_at_idx" ON "food_listings"("active", "created_at");

-- CreateIndex
CREATE INDEX "food_listing_photos_listing_id_sort_order_idx" ON "food_listing_photos"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "food_listing_categories_category_id_idx" ON "food_listing_categories"("category_id");

-- CreateIndex
CREATE INDEX "food_availability_windows_listing_id_idx" ON "food_availability_windows"("listing_id");

-- CreateIndex
CREATE INDEX "food_availability_windows_type_idx" ON "food_availability_windows"("type");

-- CreateIndex
CREATE INDEX "food_stories_seller_id_created_at_idx" ON "food_stories"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "food_stories_expires_at_idx" ON "food_stories"("expires_at");

-- CreateIndex
CREATE INDEX "food_stories_highlight_id_idx" ON "food_stories"("highlight_id");

-- CreateIndex
CREATE INDEX "food_story_highlights_seller_id_sort_order_idx" ON "food_story_highlights"("seller_id", "sort_order");

-- CreateIndex
CREATE INDEX "food_story_views_user_id_viewed_at_idx" ON "food_story_views"("user_id", "viewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "food_story_views_story_id_user_id_key" ON "food_story_views"("story_id", "user_id");

-- CreateIndex
CREATE INDEX "food_follows_seller_id_created_at_idx" ON "food_follows"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "food_follows_user_id_created_at_idx" ON "food_follows"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "food_follows_user_id_seller_id_key" ON "food_follows"("user_id", "seller_id");

-- CreateIndex
CREATE INDEX "food_saves_listing_id_created_at_idx" ON "food_saves"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "food_saves_user_id_created_at_idx" ON "food_saves"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "food_saves_user_id_listing_id_key" ON "food_saves"("user_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_orders_order_number_key" ON "food_orders"("order_number");

-- CreateIndex
CREATE INDEX "food_orders_seller_id_status_created_at_idx" ON "food_orders"("seller_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "food_orders_client_id_created_at_idx" ON "food_orders"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "food_orders_status_respond_by_idx" ON "food_orders"("status", "respond_by");

-- CreateIndex
CREATE INDEX "food_orders_status_fulfillment_at_idx" ON "food_orders"("status", "fulfillment_at");

-- CreateIndex
CREATE INDEX "food_order_items_order_id_idx" ON "food_order_items"("order_id");

-- CreateIndex
CREATE INDEX "food_order_items_listing_id_idx" ON "food_order_items"("listing_id");

-- CreateIndex
CREATE INDEX "food_order_messages_order_id_created_at_idx" ON "food_order_messages"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "food_notifications_user_id_read_at_created_at_idx" ON "food_notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "food_notifications_kind_emailed_at_idx" ON "food_notifications"("kind", "emailed_at");

-- CreateIndex
CREATE INDEX "food_demand_events_kind_created_at_idx" ON "food_demand_events"("kind", "created_at");

-- CreateIndex
CREATE INDEX "food_demand_events_query_normalized_created_at_idx" ON "food_demand_events"("query_normalized", "created_at");

-- CreateIndex
CREATE INDEX "food_demand_events_area_kind_created_at_idx" ON "food_demand_events"("area", "kind", "created_at");

-- CreateIndex
CREATE INDEX "food_demand_events_listing_id_kind_created_at_idx" ON "food_demand_events"("listing_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "food_demand_events_seller_id_kind_created_at_idx" ON "food_demand_events"("seller_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "food_seller_photos" ADD CONSTRAINT "food_seller_photos_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "food_sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_listings" ADD CONSTRAINT "food_listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "food_sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_listing_photos" ADD CONSTRAINT "food_listing_photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "food_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_listing_categories" ADD CONSTRAINT "food_listing_categories_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "food_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_listing_categories" ADD CONSTRAINT "food_listing_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "food_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_availability_windows" ADD CONSTRAINT "food_availability_windows_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "food_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_stories" ADD CONSTRAINT "food_stories_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "food_sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_stories" ADD CONSTRAINT "food_stories_linked_listing_id_fkey" FOREIGN KEY ("linked_listing_id") REFERENCES "food_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_stories" ADD CONSTRAINT "food_stories_highlight_id_fkey" FOREIGN KEY ("highlight_id") REFERENCES "food_story_highlights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_story_highlights" ADD CONSTRAINT "food_story_highlights_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "food_sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_story_views" ADD CONSTRAINT "food_story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "food_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_follows" ADD CONSTRAINT "food_follows_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "food_sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_saves" ADD CONSTRAINT "food_saves_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "food_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "food_sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "food_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_messages" ADD CONSTRAINT "food_order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- HAND-WRITTEN SQL (appended via `prisma migrate dev --create-only`, Prisma's
-- documented pattern for raw SQL — same approach Salon and Apparel used).
--
-- Everything below is invisible to Prisma's schema diffing: Prisma models
-- neither extensions nor CHECK constraints, so a later `migrate dev` will never
-- propose dropping any of it. That is precisely what makes it safe to put here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions (architecture Part E3 — Postgres-native search, no external
-- engine). `unaccent` normalises "pastelón"/"pastelon"; `pg_trgm` provides the
-- similarity operators and the GIN/GiST trigram indexes Slice 9's search and
-- Phase 5's typo tolerance are built on. Created here rather than at query time
-- so a fresh `migrate deploy` produces a working database in one step.
--
-- ⚠ PRODUCTION NOTE (Slice 6): `CREATE EXTENSION` requires SUPERUSER on the
-- shared VPS Postgres. The `apoyo_food` app role will NOT be able to run these
-- two statements itself — they must be executed as the postgres superuser
-- against the `apoyo_food` database BEFORE (or as part of) the first
-- `prisma migrate deploy`, exactly as APOYO_ECOSYSTEM.md records for
-- Apoyo-Portal's `btree_gist`. `IF NOT EXISTS` makes the pre-created case a
-- no-op, so doing it ahead of time is safe and is the recommended order.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- CHECK constraints — product invariants that belong in the database, not only
-- in whichever code path happens to write the row. Each one guards a rule that
-- an import script, a seed, or a future slice could otherwise violate silently.
-- ---------------------------------------------------------------------------

-- Part C: sellers declare 1-3 service areas. Only the UPPER bound is enforced
-- here. "At least one" is deliberately NOT a DB rule: Slice 13's onboarding is
-- skippable-and-resumable, so a PENDING seller may legitimately have no areas
-- yet; requiring one would make the row uncreatable. The >= 1 rule belongs to
-- the PENDING -> ACTIVE gate (Slice 16). Note array_length() returns NULL, not
-- 0, for an empty array — hence the explicit NULL arm.
ALTER TABLE "food_sellers" ADD CONSTRAINT "food_sellers_areas_max_three"
  CHECK (array_length("areas", 1) IS NULL OR array_length("areas", 1) <= 3);

-- Part D: `priceCents` is NULL exactly when the listing is QUOTE-priced; FIXED
-- and STARTING_AT must carry a real price. 0 is left LEGAL on purpose (a
-- giveaway, or "free with another order", is a real case) — only negatives are
-- rejected. This is the pricing model's core semantics.
ALTER TABLE "food_listings" ADD CONSTRAINT "food_listings_price_by_mode"
  CHECK (
    ("price_mode" = 'QUOTE' AND "price_cents" IS NULL)
    OR ("price_mode" IN ('FIXED', 'STARTING_AT') AND "price_cents" IS NOT NULL AND "price_cents" >= 0)
  );

-- "Feeds 0 people" is not a package.
ALTER TABLE "food_listings" ADD CONSTRAINT "food_listings_feeds_count_positive"
  CHECK ("feeds_count" IS NULL OR "feeds_count" >= 1);

-- Part D's availability semantics, encoded. Read as four independent rules:
--   1. PREORDER must say how many days ahead ("Por encargo · 2 dias").
--   2. `days_of_week` is present IF AND ONLY IF the window is RECURRING_WEEKLY.
--   3. `starts_on`/`ends_on` are present IF AND ONLY IF the window is DATE_RANGE,
--      and the range runs forwards.
--   4. `lead_time_days` is deliberately allowed on ANY type, not just PREORDER —
--      "holiday menu, Dec 1-24, order 2 days ahead" is a real listing, and
--      forbidding it would push Slice 14 into modelling one window as two.
-- Bitmask range 1..127 = at least one of the seven days, at most all seven
-- (bit 0 = Sunday .. bit 6 = Saturday).
ALTER TABLE "food_availability_windows" ADD CONSTRAINT "food_availability_windows_fields_by_type"
  CHECK (
    ("type" <> 'PREORDER' OR "lead_time_days" IS NOT NULL)
    AND (("type" = 'RECURRING_WEEKLY') = ("days_of_week" IS NOT NULL))
    AND (("type" = 'DATE_RANGE') = ("starts_on" IS NOT NULL))
    AND (("type" = 'DATE_RANGE') = ("ends_on" IS NOT NULL))
    AND ("lead_time_days" IS NULL OR "lead_time_days" >= 0)
    AND ("days_of_week" IS NULL OR "days_of_week" BETWEEN 1 AND 127)
    AND ("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on")
  );

-- An order line for zero of something is a bug, never an intent.
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_quantity_positive"
  CHECK ("quantity" >= 1);

-- Snapshot prices follow the same "0 is legal, negative is not" rule as listings.
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_price_snapshot_non_negative"
  CHECK ("price_cents_snapshot" IS NULL OR "price_cents_snapshot" >= 0);

-- The agreed price recorded at acceptance. The platform never touches money, but
-- what it records for both parties' history must at least be sane.
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_subtotal_non_negative"
  CHECK ("subtotal_cents" IS NULL OR "subtotal_cents" >= 0);

-- A Fresh Today entry that expires before it was posted would be invisible on
-- creation and would never be swept — a silent data black hole.
ALTER TABLE "food_stories" ADD CONSTRAINT "food_stories_expires_after_created"
  CHECK ("expires_at" > "created_at");

-- `result_count = 0` is the single most valuable signal in the demand stream
-- (Part E3: a zero-result search is literally unmet demand). A negative count
-- would corrupt the unmet-demand insight rather than merely look odd.
ALTER TABLE "food_demand_events" ADD CONSTRAINT "food_demand_events_result_count_non_negative"
  CHECK ("result_count" IS NULL OR "result_count" >= 0);

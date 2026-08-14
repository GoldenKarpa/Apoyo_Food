-- LC-1 · Seller visibility class + full backfill (Food).
--
-- Plan: Apoyo-Portal/Launch_Control_Plan.md §LC-1. Spec: Apoyo-Portal/
-- Provider_Onboarding_Workflow.md §6.2. The same enum lands in all four
-- vertical repos; each vertical authors its own copy against its own database,
-- and Apoyo-Demia authors the shared identity DB's.
--
-- ⚠ INERT BY DESIGN. Nothing reads `visibility_class` yet — client-facing
-- query gating is LC-4 and must not ship before this has landed everywhere.
-- Shipping this alone changes no behaviour.
--
-- ⚠ The class is on the SELLER record, not the identity account. Food is what
-- settles that: the 13 seeded sellers carry synthetic `seed-seller-…-user`
-- ids matching no identity row at all.
--
-- Backfill rulings are the user's, collected 2026-08-14. Expected production
-- row counts (16 sellers):
--
--     SHOWCASE 13   user_id LIKE 'seed-seller-%'
--     INTERNAL  3   the non-seed sellers ("Aug 8th Test Kitchen", "Sgcf", +1)
--     DEMO      0   Food has no runtime demo mechanism, only seed rows
--     REAL      0   ← every row is ruled on
--
-- After this migration NO food_sellers row should sit at the REAL default.

-- ── The enum ─────────────────────────────────────────────────────────────────
CREATE TYPE "visibility_class" AS ENUM ('REAL', 'SHOWCASE', 'DEMO', 'INTERNAL');

-- ── The column ───────────────────────────────────────────────────────────────
-- NOT NULL with a default, so existing rows are filled by Postgres in one
-- metadata-only step and every future insert is classified without the
-- application having to say anything.
ALTER TABLE "food_sellers"
    ADD COLUMN "visibility_class" "visibility_class" NOT NULL DEFAULT 'REAL';

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Both statements are guarded on `visibility_class = 'REAL'` so they are
-- strictly first-match-wins in the order below and no row is reclassified.

-- 1. SHOWCASE — the seeded storefront.
UPDATE "food_sellers"
   SET "visibility_class" = 'SHOWCASE'
 WHERE "user_id" LIKE 'seed-seller-%'
   AND "visibility_class" = 'REAL';

-- 2. INTERNAL — the three non-seed sellers, which are development test rows.
--
-- ⚠ This is the only backfill rule in the whole slice expressed as a NOT, so
-- it carries a date guard: only rows that already existed when the ruling was
-- made are swept. Without it, a seller who registered between authoring and
-- deploy would be silently classified INTERNAL and hidden forever. A genuine
-- seller created after the cutoff correctly keeps the REAL default instead,
-- and would show up in the drift query below — visible, not lost.
UPDATE "food_sellers"
   SET "visibility_class" = 'INTERNAL'
 WHERE "user_id" NOT LIKE 'seed-seller-%'
   AND "created_at" < TIMESTAMP '2026-08-15 00:00:00'
   AND "visibility_class" = 'REAL';

-- ── Verification (run by hand after deploy; not asserted here) ───────────────
-- Per-class counts, expected 13 SHOWCASE / 3 INTERNAL / 0 else:
--   SELECT visibility_class, count(*) FROM food_sellers GROUP BY 1 ORDER BY 1;
-- Drift detector — should return zero rows until a real seller is recruited:
--   SELECT id, display_name, created_at FROM food_sellers WHERE visibility_class = 'REAL';

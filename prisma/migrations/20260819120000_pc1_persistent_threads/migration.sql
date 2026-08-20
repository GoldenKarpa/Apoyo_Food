-- PC-1 · Persistent buyer↔seller threads, with a seller opt-out (Food).
--
-- Ruling: `Apoyo-Demia/PRE_LAUNCH_CHECKLIST.md` §5, "Food — post-order chat
-- becomes a persistent buyer↔seller thread, provider-controlled" (2026-08-19).
-- Supersedes `Apoyo_Food_Architecture.md` Part D's "one thread per order — no
-- separate thread entity is needed in MVP".
--
-- ⚠ HAND-WRITTEN, like every migration since LC-1 — there is no local database
-- in this environment, so `prisma migrate dev` cannot author it. It is written
-- to be diff-equivalent to what Prisma would emit from `schema.prisma`, PLUS a
-- backfill Prisma would never write. If you regenerate this, you lose the
-- backfill and every existing message is stranded with a NULL `thread_id` that
-- the NOT NULL constraint below then rejects.
--
-- Shape of the change:
--   1. `food_order_messages` is RENAMED to `food_messages` — not recreated.
--      The rows, the primary key and the indexes survive the rename, so there
--      is no window in which a message exists in one table and not the other.
--   2. Ownership moves from the order to the thread: `thread_id` is the new
--      NOT NULL owner (cascade), `order_id` becomes NULLABLE with SET NULL and
--      survives only as context ("this was about FD-4821").
--   3. One `food_threads` row per (seller, buyer) pair that ALREADY HAS at
--      least one message, and every existing message is attached to it. Pairs
--      with orders but no messages get a thread lazily on first send —
--      creating empty threads here would drop a list of blank conversations
--      into every seller's new Messages section on day one.
--
-- ⚠ What this migration does NOT do, deliberately: it does not grant anyone the
-- right to send a message. The anti-spam gate ("at least one order between this
-- pair") is application logic in `lib/thread.ts`'s `resolveThreadAccess`,
-- re-derived per send from live order state — a `food_threads` row is a
-- container, never a permission. Reading a thread row as "may message" is the
-- one misreading that reopens the spam surface order-scoping used to close.

-- ── 1 · Seller settings ──────────────────────────────────────────────────────
--
-- ⚠ All three defaults are the PERMISSIVE value, and that is the user ruling
-- itself, not a convenience: post-order conversation is an escape hatch a
-- seller switches OFF, "not a feature they must discover and switch on".
-- Existing sellers are therefore already correct with no backfill — every row
-- inherits allowed/on in one metadata-only step.
--
-- `notification_prefs` defaults to an EMPTY object, not a populated one: the
-- real per-category default lives in `lib/notification-prefs.ts` so there is
-- one source of truth, and so adding a category later needs no backfill here.
ALTER TABLE "food_sellers"
    ADD COLUMN "post_order_messaging"  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "message_read_receipts" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "notification_prefs"    JSONB   NOT NULL DEFAULT '{}';

-- ── 2 · The new notification kind ────────────────────────────────────────────
--
-- ⚠ Postgres will not let the same transaction that adds an enum value also USE
-- it (the same rule BUILD_SLICES.md's `Vertical`-enum note records). Nothing
-- here inserts a `THREAD_MESSAGE` row, so adding it in this migration is safe;
-- the first such row is written by the application, long after commit.
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'THREAD_MESSAGE';

-- ── 3 · The thread table ─────────────────────────────────────────────────────
CREATE TABLE "food_threads" (
    "id"              TEXT         NOT NULL,
    "seller_id"       TEXT         NOT NULL,
    "client_id"       TEXT         NOT NULL,
    "client_email"    TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_threads_pkey" PRIMARY KEY ("id")
);

-- The pair IS the identity of a thread — one conversation per relationship,
-- forever. This constraint is also what makes the application's `upsert` the
-- safe resolution under two concurrent first sends.
CREATE UNIQUE INDEX "food_threads_seller_id_client_id_key"
    ON "food_threads" ("seller_id", "client_id");
CREATE INDEX "food_threads_seller_id_last_message_at_idx"
    ON "food_threads" ("seller_id", "last_message_at");
CREATE INDEX "food_threads_client_id_last_message_at_idx"
    ON "food_threads" ("client_id", "last_message_at");

-- Restrict, matching `food_orders.seller_id`: a seller carrying conversation
-- history cannot be hard-deleted. `SellerStatus.SUSPENDED` is the mechanism for
-- taking one out of circulation.
ALTER TABLE "food_threads"
    ADD CONSTRAINT "food_threads_seller_id_fkey"
    FOREIGN KEY ("seller_id") REFERENCES "food_sellers" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 4 · Rename the message table, preserving every row ───────────────────────
--
-- Postgres carries indexes and constraints across a table rename but keeps
-- their OLD NAMES, so each is renamed explicitly — otherwise a later
-- `prisma migrate diff` sees names that don't match the schema and proposes
-- spurious churn.
ALTER TABLE "food_order_messages" RENAME TO "food_messages";

ALTER INDEX "food_order_messages_pkey"                    RENAME TO "food_messages_pkey";
ALTER INDEX "food_order_messages_order_id_created_at_idx" RENAME TO "food_messages_order_id_created_at_idx";
ALTER TABLE "food_messages"
    RENAME CONSTRAINT "food_order_messages_order_id_fkey" TO "food_messages_order_id_fkey";

-- ── 5 · Thread ownership ─────────────────────────────────────────────────────
--
-- Added nullable, backfilled, THEN made NOT NULL — the only order that works on
-- a table that already has rows.
ALTER TABLE "food_messages" ADD COLUMN "thread_id" TEXT;

-- One thread per (seller, buyer) pair that already has a message. `client_id`
-- comes from the ORDER, which is the only place a message's counterpart is
-- recorded today — `sender_user_id` alone cannot identify the pair (a run of
-- purely seller-sent messages would name no buyer at all).
--
-- ⚠ Backfilled ids are `thr_` + a UUID rather than the `cuid()` the application
-- generates. Deliberate and harmless: the column is TEXT with no format
-- contract, `gen_random_uuid()` is built into Postgres 16 (no pgcrypto
-- dependency), and SQL has no cuid generator. The prefix also makes a
-- backfilled row identifiable at a glance if one ever needs investigating.
INSERT INTO "food_threads" ("id", "seller_id", "client_id", "client_email", "last_message_at", "created_at", "updated_at")
SELECT
    'thr_' || replace(gen_random_uuid()::text, '-', ''),
    o."seller_id",
    o."client_id",
    -- The pair's most recent non-null snapshot, so a buyer who changed address
    -- mid-history lands on the newer one.
    (ARRAY_REMOVE(ARRAY_AGG(o."client_email" ORDER BY o."created_at" DESC), NULL))[1],
    MAX(m."created_at"),
    MIN(m."created_at"),
    MAX(m."created_at")
FROM "food_messages" m
JOIN "food_orders" o ON o."id" = m."order_id"
GROUP BY o."seller_id", o."client_id";

UPDATE "food_messages" m
   SET "thread_id" = t."id"
  FROM "food_orders" o
  JOIN "food_threads" t
    ON t."seller_id" = o."seller_id" AND t."client_id" = o."client_id"
 WHERE m."order_id" = o."id";

-- ⚠ A guard, not a formality. Every pre-existing message reached a thread via
-- its order above; if any row is still NULL the migration ABORTS rather than
-- silently stranding conversation or failing later with an opaque NOT NULL
-- violation. `order_id` was NOT NULL before this migration and the old FK
-- cascaded, so the only way to get here is a message whose order vanished —
-- which should be impossible, and is worth failing loudly on if it happened.
DO $do$
DECLARE orphans BIGINT;
BEGIN
    SELECT count(*) INTO orphans FROM "food_messages" WHERE "thread_id" IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION 'PC-1 backfill left % message(s) with no thread — aborting rather than stranding them', orphans;
    END IF;
END
$do$;

ALTER TABLE "food_messages" ALTER COLUMN "thread_id" SET NOT NULL;

CREATE INDEX "food_messages_thread_id_created_at_idx"
    ON "food_messages" ("thread_id", "created_at");

ALTER TABLE "food_messages"
    ADD CONSTRAINT "food_messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "food_threads" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 6 · The order becomes context, not owner ─────────────────────────────────
--
-- Was NOT NULL + ON DELETE CASCADE — an order deletion took its conversation
-- with it, which was the only cleanup this app had. Now nullable + SET NULL: a
-- message sent between orders has no order to name, and deleting an order must
-- leave the conversation about it standing. Retention is `sweepIdleThreads`'s
-- job from here on.
ALTER TABLE "food_messages" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "food_messages" DROP CONSTRAINT "food_messages_order_id_fkey";
ALTER TABLE "food_messages"
    ADD CONSTRAINT "food_messages_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "food_orders" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 7 · Existing notifications learn their thread ────────────────────────────
--
-- `ORDER_MESSAGE` rows written before this migration carry only
-- `{orderId, orderNumber}`. `markThreadNotificationsRead` clears by `threadId`,
-- so without this an already-unread message notification could never be cleared
-- from the new Messages section — only by opening the old order page. `||`
-- merges into the existing payload; it never replaces it.
UPDATE "food_notifications" n
   SET "payload" = n."payload" || jsonb_build_object('threadId', t."id")
  FROM "food_orders" o
  JOIN "food_threads" t
    ON t."seller_id" = o."seller_id" AND t."client_id" = o."client_id"
 WHERE n."kind" = 'ORDER_MESSAGE'
   AND n."payload" ->> 'orderId' = o."id"
   AND n."payload" ->> 'threadId' IS NULL;

-- ── Verification (run by hand after deploy; not asserted here) ───────────────
-- Every message has a thread, and no thread is empty:
--   SELECT count(*) FROM food_messages WHERE thread_id IS NULL;                 -- 0
--   SELECT count(*) FROM food_threads t
--    WHERE NOT EXISTS (SELECT 1 FROM food_messages m WHERE m.thread_id = t.id); -- 0
-- No pair was split across two threads:
--   SELECT seller_id, client_id, count(*) FROM food_threads
--    GROUP BY 1, 2 HAVING count(*) > 1;                                         -- 0 rows
-- Every seller starts permissive:
--   SELECT count(*) FROM food_sellers WHERE post_order_messaging IS NOT TRUE;   -- 0

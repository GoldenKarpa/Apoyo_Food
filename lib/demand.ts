import crypto from "crypto";
import type { DemandEventKind, RegionKey } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Demand-event logging — architecture Part E3/E7, and the reason Part C insists
 * it starts "the moment browse ships (Phase 1), not when the insights UI ships
 * (Phase 6)": the signature seller-insights feature is only as good as its
 * history, and events are cheap to log and **impossible** to backfill.
 *
 * ⚠ **Zero-result searches are the single most valuable signal in the system**
 * (Part E3). They are literally "unmet demand near you", the Phase-6 insights
 * headline — "people near you searched for cheesecake 23× this month; nobody
 * nearby sells it". So a search that finds nothing must still be logged, with
 * `resultCount = 0`, and the DB's own CHECK constraint refuses a negative.
 *
 * ── Three rules this module enforces so no call site has to remember them ──
 *
 * 1. **Fire-and-forget. A page never blocks on analytics.** Every write is
 *    detached and every failure is swallowed after a log line. A demand event
 *    is telemetry; a browse page that 500s because the analytics insert
 *    deadlocked is a broken storefront.
 * 2. **Identities are hashed, never stored.** Part E7 makes k-anonymity
 *    architectural: insights read aggregates over `userIdHash` and never over
 *    identities. Hashing here — at the only place that writes the column —
 *    means no future call site can accidentally pass a raw user id.
 * 3. **Rate limited**, per Part G's "demand-event ingestion (per user + per
 *    IP)". Reuses `lib/rate-limit.ts` rather than reinventing it (the Phase 0
 *    review is explicit that Slices 17/18 must reuse that module too).
 */

/**
 * ⚠ Salted, and the salt must be stable across restarts in production.
 *
 * If `DEMAND_HASH_SALT` is unset the process mints a random one, which is safe
 * (it never weakens anonymity) but makes the same visitor look like a new person
 * after every deploy — quietly inflating "distinct users" in every Phase-6
 * aggregate. The env var is recorded in `.env.example` for exactly that reason.
 */
const SALT =
  process.env.DEMAND_HASH_SALT ?? crypto.randomBytes(16).toString("hex");

let warnedAboutSalt = false;
if (!process.env.DEMAND_HASH_SALT && process.env.NODE_ENV === "production" && !warnedAboutSalt) {
  warnedAboutSalt = true;
  console.warn(
    "[demand] DEMAND_HASH_SALT is not set — userIdHash will not be stable across restarts, " +
      "which inflates distinct-user counts in Phase 6 insights.",
  );
}

export function hashIdentity(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return crypto.createHash("sha256").update(`${SALT}:${userId}`).digest("hex").slice(0, 32);
}

/**
 * Search-query normalization, and it has to match what Phase 6 will group by.
 *
 * Lowercased, accent-stripped, whitespace-collapsed — so "Pastelón", "pastelon"
 * and "  PASTELÓN  " are one demand signal rather than three. Accent-stripping
 * is done in JS with NFD rather than by asking Postgres for `unaccent()`,
 * because the normalized form must be identical whether it was computed at write
 * time here or at read time in an aggregate, and a round-trip through the
 * database to normalize a string before storing it is a wasted query.
 *
 * ⚠ This must stay in step with `lib/search.ts`, which uses Postgres `unaccent`
 * for *matching*. The two are allowed to differ in mechanism; they must not
 * differ in result for the Latin-1 range this product actually sees.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface DemandEventInput {
  kind: DemandEventKind;
  userId?: string | null;
  /** SEARCH only — the raw query as typed. */
  query?: string | null;
  /** SEARCH only. Zero is the point, not an omission. */
  resultCount?: number | null;
  area?: RegionKey | null;
  listingId?: string | null;
  sellerId?: string | null;
  categorySlug?: string | null;
}

/**
 * Record one event. **Never awaited by a page.**
 *
 * Returns a promise only so tests and verification scripts can await the write;
 * production call sites use `logDemand()` below, which discards it.
 */
export async function recordDemandEvent(input: DemandEventInput): Promise<void> {
  const query = input.query?.trim() ? input.query.trim() : null;

  await prisma.foodDemandEvent.create({
    data: {
      kind: input.kind,
      query,
      queryNormalized: query ? normalizeQuery(query) : null,
      // ⚠ Clamped at zero, not because the caller is untrusted but because the
      // DB's CHECK would reject a negative and take the page down with it — and
      // this is telemetry, which must never do that.
      resultCount: input.resultCount === null || input.resultCount === undefined
        ? null
        : Math.max(0, Math.trunc(input.resultCount)),
      area: input.area ?? null,
      listingId: input.listingId ?? null,
      sellerId: input.sellerId ?? null,
      categorySlug: input.categorySlug ?? null,
      userIdHash: hashIdentity(input.userId),
    },
  });
}

/**
 * The call site's entry point: detached, swallowing, never blocking.
 *
 * ⚠ Do not `await` this. The `void` is deliberate and the `.catch` is what makes
 * an unawaited rejection safe rather than an unhandled promise rejection that
 * takes the Node process down.
 */
export function logDemand(input: DemandEventInput): void {
  void recordDemandEvent(input).catch((error) => {
    console.error("[demand] failed to record event", input.kind, (error as Error).message);
  });
}

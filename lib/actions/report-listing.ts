"use server";

import type { ReportReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { discoverable } from "@/lib/discovery";

const VALID_REASONS = new Set<string>(["INAPPROPRIATE", "SUSPECTED_SCAM", "FOOD_SAFETY_CONCERN", "OTHER"]);

export type ReportListingResult = { ok: true } | { ok: false; reason: "invalid" | "not_found" };

/**
 * Slice 16's buyer-facing "intake" half of report/flag — without this, the
 * admin review queue could never have anything real in it. No sign-in
 * requirement: the storefront is anonymous-browsable everywhere (architecture
 * F3), and a bad listing is exactly the kind of thing a browsing-but-not-
 * signed-in buyer is the first to notice.
 *
 * ⚠ Anonymous + no rate limit means this is floodable — the same finding
 * Apparel's Slice 16 made about its own equivalent action. There is no stable
 * identity to throttle an anonymous reporter by, so the mitigation is on the
 * other side: at most one OPEN report per listing. Once a listing has an open
 * report, further reports on it are accepted (the buyer still sees "thanks,
 * we'll take a look" — their intent isn't rejected) but don't create a new
 * row, so a flood can't make one seller's listing dominate the admin queue
 * with duplicates. A genuinely different concern about the same listing is
 * still visible to admin via the first report; distinct listings each still
 * get their own row.
 *
 * Looked up through `DISCOVERABLE` deliberately — a listing that is already
 * taken down or hidden has nothing left to flag.
 */
export async function reportListing(
  listingId: string,
  reasonInput: string,
  message: string,
): Promise<ReportListingResult> {
  if (!VALID_REASONS.has(reasonInput)) return { ok: false, reason: "invalid" };

  const listing = await prisma.foodListing.findFirst({
    where: { id: listingId, ...(await discoverable()) },
    select: { id: true, sellerId: true },
  });
  if (!listing) return { ok: false, reason: "not_found" };

  const existingOpenReport = await prisma.foodReport.findFirst({
    where: { listingId: listing.id, status: "OPEN" },
    select: { id: true },
  });
  if (existingOpenReport) return { ok: true };

  const session = await getFoodSession();

  await prisma.foodReport.create({
    data: {
      listingId: listing.id,
      sellerId: listing.sellerId,
      reporterUserId: session?.userId ?? null,
      reason: reasonInput as ReportReason,
      message: message.trim() ? message.trim().slice(0, 1000) : null,
    },
  });

  return { ok: true };
}

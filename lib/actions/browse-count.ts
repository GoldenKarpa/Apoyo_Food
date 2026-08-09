"use server";

import { prisma } from "@/lib/prisma";
import { buildWhere, type BrowseFilters } from "@/lib/browse";

/**
 * The one caller of this — `<FilterSheet>`'s "Show N results" button needs a
 * live count for the currently-staged (not-yet-applied) filter combination,
 * and a Client Component can only reach server-only code through a Server
 * Action. No auth check: this is the exact same buyer-visible count
 * `browseListings` itself computes for the (anonymous-browsable) feed —
 * nothing here reveals anything a plain page load wouldn't.
 */
export async function getBrowseResultCount(filters: BrowseFilters): Promise<number> {
  return prisma.foodListing.count({ where: buildWhere(filters) });
}

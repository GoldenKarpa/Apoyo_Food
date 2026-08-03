import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * The pre-launch "Coming Soon" gate for real ordering (Slice 17), stored as a
 * single admin-toggled row rather than a code-level flag — the user's own
 * instruction: the feature ships fully built but administratively PAUSED, and
 * flipping it on is an admin action at `/food/admin`, not a redeploy.
 *
 * ⚠ No row yet == disabled. `getOrderingEnabled()` never seeds one — the row
 * is created lazily by the first admin toggle (`setOrderingEnabled`) — so the
 * feature ships default-OFF with zero migration-time data decisions.
 */

const SETTING_ID = "singleton";

/**
 * `cache()` dedupes repeated reads within ONE request (the same reasoning as
 * `lib/seller.ts`'s `loadSellerWorkspace`) — it does NOT persist across
 * requests, so an admin's toggle is visible on the very next page load. Every
 * page that reads this is already dynamically rendered (it reads the session
 * or a cookie upstream), so there is no static-cache staleness to worry about
 * on top of the per-request memo.
 */
export const getOrderingEnabled = cache(async function getOrderingEnabled(): Promise<boolean> {
  const row = await prisma.foodPlatformSetting.findUnique({
    where: { id: SETTING_ID },
    select: { orderingEnabled: true },
  });
  return row?.orderingEnabled ?? false;
});

export async function setOrderingEnabled(enabled: boolean): Promise<void> {
  await prisma.foodPlatformSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, orderingEnabled: enabled },
    update: { orderingEnabled: enabled },
  });
}

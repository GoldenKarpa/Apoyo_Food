import { getTranslations } from "next-intl/server";

import { OrderMessageComposer, type ComposerTarget } from "@/components/order-message-composer";
import type { ThreadAccess } from "@/lib/thread";

/**
 * PC-1 — the composer, or the reason there isn't one. Every conversation
 * surface (both order detail pages, both Messages pages) renders this rather
 * than a composer directly, so the four of them cannot drift on what a blocked
 * buyer sees.
 *
 * ⚠ **The two refusals are shown differently, and that is the 2026-08-19 UX
 * ruling, not a stylistic choice:**
 *
 *  - `activeOrdersOnly` — the seller has opted out — says so plainly. A buyer
 *    who messaged this seller last month and now finds the box gone would read
 *    silence as a bug and go looking for support; naming it costs one line and
 *    ends the question.
 *  - `orderRequired` — no order between the pair — renders NOTHING. There is
 *    nothing to explain, because messaging was never offered: the entry point
 *    to this surface only appears once an order exists. Explaining it here
 *    would advertise a channel to exactly the person the gate excludes, and
 *    turn the anti-spam rule into a documented target.
 *
 * ⚠ This is presentation only. `resolveThreadAccess` runs again server-side
 * inside every send, so a page that wrongly renders a composer produces a
 * `blocked` result, never a written message.
 */
export async function ThreadComposerSection({
  access,
  target,
  actor,
}: {
  access: ThreadAccess;
  target: ComposerTarget;
  actor: "seller" | "client";
}) {
  const t = await getTranslations("orderThread.access");

  if (access.canWrite) return <OrderMessageComposer target={target} actor={actor} />;

  if (access.reason === "activeOrdersOnly") {
    return (
      <p className="rounded-card border border-hairline bg-sunken p-4 text-label text-ink">
        {/* The seller reads their own setting described back to them; the buyer
            reads what it means for them. Same state, two audiences. */}
        {actor === "seller" ? t("sellerOptedOutOwn") : t("sellerOptedOut")}
      </p>
    );
  }

  return null;
}

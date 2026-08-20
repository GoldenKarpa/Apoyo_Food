import { useTranslations } from "next-intl";

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
/**
 * ⚠ **Isomorphic on purpose (PD-S10) — no `"use client"`, no `async`.**
 *
 * next-intl v4 resolves `useTranslations()` on either side of the RSC boundary
 * (already this repo's own pattern in `components/ui/*`), so this file server-
 * renders on the four real conversation surfaces exactly as it did before AND
 * renders client-side inside `/food/demo`, where the whole transcript lives in
 * React state and must re-render on every fixture send. An `async` component
 * cannot do the second thing at all. Do not reintroduce `await
 * getTranslations()` here — that is the one line that would silently take the
 * demo's conversation section out of the product.
 */
export function ThreadComposerSection({
  access,
  target,
  actor,
}: {
  access: ThreadAccess;
  target: ComposerTarget;
  actor: "seller" | "client";
}) {
  const t = useTranslations("orderThread.access");

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

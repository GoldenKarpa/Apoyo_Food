import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { startThreadWithSeller } from "@/lib/actions/thread";
import { findThreadForPair, resolveThreadAccess } from "@/lib/thread";

/**
 * PC-1 — the buyer's entry point to a seller's conversation, on the kitchen's
 * own profile page.
 *
 * ⚠ **Renders nothing at all for a buyer with no order history**, which is the
 * 2026-08-19 UX ruling and also the anti-spam gate's outward face. There is no
 * "you must order first" explainer here on purpose: messaging was never
 * offered to that visitor, so there is nothing to explain, and an explainer
 * would advertise a channel to exactly the person the gate excludes.
 *
 * The seller's opt-out is treated differently — a buyer who HAS transacted
 * still sees the entry point when a thread exists, because the conversation
 * and its history remain readable; only the composer inside is withheld, with
 * a reason (`<ThreadComposerSection>`).
 *
 * ⚠ The button is not the gate. `startThreadWithSeller` re-checks access
 * server-side, because a public profile page's HTML is cacheable and a server
 * action is callable directly.
 */
export async function MessageSellerLink({ sellerId, viewerUserId }: { sellerId: string; viewerUserId: string | null }) {
  if (!viewerUserId) return null;

  const [access, existing] = await Promise.all([
    resolveThreadAccess(sellerId, viewerUserId),
    findThreadForPair(sellerId, viewerUserId),
  ]);

  // Never transacted: no entry point, no explanation.
  if (!access.hasEngagedOrder && !access.hasOpenOrder) return null;

  const t = await getTranslations("client.messages");

  // An existing conversation is always reachable — the opt-out narrows writing,
  // never reading. A brand-new one is only worth opening if a message could
  // actually be sent into it.
  if (existing) {
    return (
      <Button asChild variant="secondary">
        <Link href={`/messages/${existing.id}`}>
          <MessagesSquare aria-hidden className="h-4 w-4" />
          {t("openThread")}
        </Link>
      </Button>
    );
  }

  if (!access.canWrite) return null;

  return (
    <form action={startThreadWithSeller.bind(null, sellerId)}>
      <Button type="submit" variant="secondary">
        <MessagesSquare aria-hidden className="h-4 w-4" />
        {t("messageSeller")}
      </Button>
    </form>
  );
}

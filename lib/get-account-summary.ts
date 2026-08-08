import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { getMemberships } from "@/lib/ecosystem";
import type { AccountSummary, FoodProviderStatus, OtherProviderVertical } from "@/lib/account-summary";

const OTHER_PROVIDER_VERTICALS: OtherProviderVertical[] = ["APPAREL", "SALON", "SOCIAL"];

/**
 * Server-only — kept OUT of `lib/account-summary.ts` deliberately, so that
 * file (and its pure `AccountSummary`/`accountInitial` exports) stays safe
 * for a Client Component to import. See that file's own header comment.
 *
 * Null for a signed-out visitor. Reads `FoodSeller` (local) and
 * `getMemberships()` (ecosystem, one call, reused for both Food's own status
 * and the other-vertical Provider list) directly, rather than going through
 * `requireFoodSeller()` — that helper collapses "no local row", "no active
 * membership", and "local row not ACTIVE" into a single `null`, which loses
 * exactly the distinction `foodStatus` needs to make. Each read is its own
 * try/catch so a transient ecosystem or DB blip degrades that ONE signal to
 * its safe default rather than taking the whole nav down — the same
 * fail-closed-without-breaking-the-page lesson `<SiteFooter>` already learned
 * once (Slice 16).
 */
export async function getAccountSummary(): Promise<AccountSummary | null> {
  const session = await getFoodSession();
  if (!session) return null;

  let foodSellerActive = false;
  try {
    const seller = await prisma.foodSeller.findUnique({ where: { userId: session.userId } });
    foodSellerActive = seller?.status === "ACTIVE";
  } catch (err) {
    console.error("[get-account-summary] FoodSeller lookup failed, defaulting to no local standing", err);
  }

  let hasActiveFoodProviderMembership = false;
  let otherProviderVerticals: OtherProviderVertical[] = [];
  try {
    const memberships = await getMemberships(session.userId);
    hasActiveFoodProviderMembership = memberships.some(
      (m) => m.vertical === "FOOD" && m.role === "PROVIDER" && m.status === "ACTIVE",
    );
    otherProviderVerticals = OTHER_PROVIDER_VERTICALS.filter((vertical) =>
      memberships.some((m) => m.vertical === vertical && m.role === "PROVIDER" && m.status === "ACTIVE"),
    );
  } catch (err) {
    console.error("[get-account-summary] getMemberships failed, defaulting to no provider standing", err);
  }

  const foodStatus: FoodProviderStatus = foodSellerActive && hasActiveFoodProviderMembership
    ? "provider"
    : hasActiveFoodProviderMembership
      ? "provider_pending"
      : "client";

  return {
    email: session.email ?? "",
    name: session.name,
    foodStatus,
    otherProviderVerticals,
    isAdmin: session.legacyRole === "ADMIN",
  };
}

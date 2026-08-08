import { getFoodSession } from "@/lib/session";
import { requireFoodSeller } from "@/lib/auth-guards";
import type { AccountSummary } from "@/lib/account-summary";

/**
 * Server-only — kept OUT of `lib/account-summary.ts` deliberately, so that
 * file (and its pure `AccountSummary`/`accountInitial` exports) stays safe
 * for a Client Component to import. See that file's own header comment.
 *
 * Null for a signed-out visitor. `isProvider` costs a real ecosystem API call
 * (`requireFoodSeller()` reads live membership status, never the JWT's
 * possibly-stale claim — see `lib/session.ts`), and this renders on every
 * page via the shared client layout, so a transient ecosystem blip must never
 * take the whole nav down with it — the same fail-closed-without-breaking-the-
 * page lesson `<SiteFooter>` already learned once (Slice 16). Defaults
 * `isProvider` to `false` on any error rather than throwing.
 */
export async function getAccountSummary(): Promise<AccountSummary | null> {
  const session = await getFoodSession();
  if (!session) return null;

  let isProvider = false;
  try {
    isProvider = (await requireFoodSeller()) !== null;
  } catch (err) {
    console.error("[get-account-summary] requireFoodSeller failed, defaulting isProvider to false", err);
  }

  return {
    email: session.email ?? "",
    name: session.name,
    isProvider,
    isAdmin: session.legacyRole === "ADMIN",
  };
}

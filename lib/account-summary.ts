/**
 * Pure, client-safe types/logic for the nav account avatar/modal.
 *
 * ⚠ Deliberately holds NOTHING that imports `lib/session.ts` (which pulls in
 * `next/headers`) — the actual session read lives in the separate
 * `lib/get-account-summary.ts` instead. A first pass put `getAccountSummary`
 * in THIS file, and the build itself caught the mistake: `<AccountModal>` (a
 * Client Component) imports `accountInitial`/`AccountSummary` from here, and
 * webpack's server/client boundary check flags the whole MODULE, not just the
 * specific export used, once anything in a file transitively touches
 * `next/headers`. Keeping the server-only fetch in its own file is what makes
 * that boundary safe to reason about.
 */
/**
 * Food's own standing, three-way rather than a boolean:
 *  - `"provider"` — a fully ACTIVE local `FoodSeller` row AND an active
 *    `(FOOD, PROVIDER)` ecosystem membership. The real, dashboard-eligible case.
 *  - `"provider_pending"` — the ecosystem membership exists (another vertical's
 *    onboarding, a directly-seeded fixture, or a partial signup) but no local
 *    `FoodSeller` row does. Genuinely different from an ordinary buyer, and
 *    worth surfacing as such rather than silently folding into `"client"`.
 *  - `"client"` — neither of the above; Food's own implicit default state for
 *    any signed-in visitor, per `lib/get-account-summary.ts`'s own note.
 */
export type FoodProviderStatus = "provider" | "provider_pending" | "client";

/** The other verticals a Provider badge can legitimately name — DEMIA excluded on purpose, kept off this account surface. */
export type OtherProviderVertical = "APPAREL" | "SALON" | "SOCIAL";

export interface AccountSummary {
  email: string;
  name: string | null;
  foodStatus: FoodProviderStatus;
  /** Other verticals with an active `PROVIDER` ecosystem membership — Food has no local completion signal for these, so there is no `_pending` equivalent here. */
  otherProviderVerticals: OtherProviderVertical[];
  isAdmin: boolean;
}

/**
 * The avatar's single letter: the first Unicode letter of `name` if set,
 * else of `email`. Null when neither contains one at all (a numeral/symbol
 * as the very first character of both an unset-name account's email and,
 * hypothetically, a name) — the caller falls back to the generic person
 * icon rather than render a digit or symbol in a circle.
 */
export function accountInitial(summary: Pick<AccountSummary, "name" | "email">): string | null {
  const source = summary.name?.trim() || summary.email;
  const match = source.match(/\p{L}/u);
  return match ? match[0].toLocaleUpperCase() : null;
}

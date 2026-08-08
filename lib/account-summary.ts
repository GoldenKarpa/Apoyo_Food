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
export interface AccountSummary {
  email: string;
  name: string | null;
  /** A fully ACTIVE seller, not merely PENDING — see `lib/get-account-summary.ts`. */
  isProvider: boolean;
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

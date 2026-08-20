/**
 * PC-1 — the seller's notification delivery preferences.
 *
 * User ruling, 2026-08-19: **"chat now, structured for expansion later"** — the
 * only category the app reads today is `chat`, but the shape is per-category
 * from the start so adding one later is a code change with no migration.
 *
 * ⚠ **Order-lifecycle mail is deliberately NOT a category here and must not
 * become one without a new ruling.** "You have a new order" is transactional:
 * a seller who silences it has a broken business rather than a quieter one.
 * The escape hatch for a noisy inbox is `FoodSeller.postOrderMessaging` (stop
 * the conversation) and `OFF` below (stop being chased about it) — never
 * muting the order pipeline itself.
 *
 * ⚠ Stored as JSON on `FoodSeller.notificationPrefs`, whose column default is
 * `{}` — the real default lives HERE, in `DEFAULT_DELIVERY`, so there is one
 * source of truth and no backfill is ever needed when a category is added.
 * Deliberately not a Prisma enum: `prisma/schema.prisma`'s own header rules
 * that "an enum type with no table reading it is noise, not foresight", and no
 * column would reference it.
 */

export const NOTIFICATION_DELIVERIES = ["IN_APP_AND_EMAIL", "IN_APP", "OFF"] as const;
export type NotificationDelivery = (typeof NOTIFICATION_DELIVERIES)[number];

/** The categories this shape can express. Only `chat` is read today. */
export const NOTIFICATION_CATEGORIES = ["chat"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * ⚠ The permissive default, and it is the ruling: a seller who has never opened
 * the setting is reachable by both channels. Email is still throttled by
 * `shouldSendDebouncedEmail` — at most one per conversation per 15 minutes,
 * never one per message.
 */
export const DEFAULT_DELIVERY: NotificationDelivery = "IN_APP_AND_EMAIL";

function isDelivery(value: unknown): value is NotificationDelivery {
  return typeof value === "string" && (NOTIFICATION_DELIVERIES as readonly string[]).includes(value);
}

/**
 * Reads one category out of the stored JSON, tolerating every shape a JSON
 * column can actually hold — `null`, an array, a stale key, a value written by
 * an older build. Anything unrecognised resolves to the default rather than
 * throwing: a malformed preferences blob must degrade to "notify me", never to
 * a seller silently missing messages or to a 500 on the send path.
 */
export function deliveryFor(prefs: unknown, category: NotificationCategory): NotificationDelivery {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return DEFAULT_DELIVERY;
  const value = (prefs as Record<string, unknown>)[category];
  return isDelivery(value) ? value : DEFAULT_DELIVERY;
}

/**
 * Merges one category's choice into an existing blob, preserving every other
 * key. A read-modify-write rather than a replace, so a future category's value
 * isn't wiped by a save from a form that predates it.
 */
export function withDelivery(
  prefs: unknown,
  category: NotificationCategory,
  delivery: NotificationDelivery,
): Record<string, string> {
  const base: Record<string, string> = {};
  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
    for (const [key, value] of Object.entries(prefs as Record<string, unknown>)) {
      if (typeof value === "string") base[key] = value;
    }
  }
  base[category] = delivery;
  return base;
}

export function parseDelivery(value: unknown): NotificationDelivery | null {
  return isDelivery(value) ? value : null;
}

/** Convenience splits, so call sites read as intent rather than as enum comparisons. */
export function wantsInApp(delivery: NotificationDelivery): boolean {
  return delivery !== "OFF";
}

export function wantsEmail(delivery: NotificationDelivery): boolean {
  return delivery === "IN_APP_AND_EMAIL";
}

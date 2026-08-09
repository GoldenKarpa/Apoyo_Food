import { cache } from "react";

/**
 * Ecosystem API client — the ONLY door Food has into identity (architecture
 * Part B1). It must never touch the identity store's legacy `role` field
 * (tie-up #1), and it never writes identity tables directly.
 *
 * ⚠ Hosting, re-confirmed live 2026-07-30 rather than taken from the docs:
 *   - `/memberships` and `/users/{id}/memberships` exist in **both** the
 *     Apoyo-Demia app and portal-web. The ecosystem arch doc says memberships
 *     "are Apoyo-Demia-hosted and stay Apoyo-Demia-hosted"; in practice both
 *     apps expose them, both read the same identity database, and the nginx
 *     path-split on portal.apoyolime.com makes the distinction invisible to a
 *     caller. Pointing `ECOSYSTEM_API_BASE_URL` at portal.apoyolime.com is
 *     therefore correct either way. **Consequence: any allowlist or validator
 *     gating these routes must be changed in BOTH copies** — which is why
 *     Slice 3's `"food-app"` grant went into both apps' `lib/ecosystem-auth.ts`.
 *   - `/config/registration` (contract §6b) is **portal-web only** — it does not
 *     exist in the Apoyo-Demia app.
 *
 * ⚠ Food carries only ONE ecosystem token. `PORTAL_CLAIMS_SERVICE_TOKEN` (the
 * same-name-different-value gotcha in APOYO_ECOSYSTEM.md) is deliberately not
 * used or declared: Food pushes no `TimeClaim`s in any phase of this plan
 * (architecture Part B3), so there is no second service to authenticate to.
 */

export type EcosystemVertical = "DEMIA" | "SOCIAL" | "SALON" | "APPAREL" | "FOOD";
export type EcosystemMembershipRole = "PROVIDER" | "CLIENT";
export type EcosystemMembershipStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface EcosystemMembership {
  vertical: EcosystemVertical;
  role: EcosystemMembershipRole;
  status: EcosystemMembershipStatus;
}

function ecosystemUrl(path: string): string {
  return `${process.env.ECOSYSTEM_API_BASE_URL}/api/ecosystem/v1${path}`;
}

function ecosystemHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.ECOSYSTEM_SERVICE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

const TTL_MS = 60_000;
const ttlCache = new Map<string, { memberships: EcosystemMembership[]; expiresAt: number }>();
/**
 * In-flight requests, so N concurrent callers for the same user share one fetch.
 * This replaces what React's `cache()` used to provide here — see the note on
 * `getMemberships` for why that wrapper had to go.
 */
const inFlight = new Map<string, Promise<EcosystemMembership[]>>();

async function fetchMemberships(userId: string): Promise<EcosystemMembership[]> {
  const res = await fetch(ecosystemUrl(`/users/${userId}/memberships`), {
    headers: ecosystemHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ecosystem memberships fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { memberships: EcosystemMembership[] };
  return data.memberships;
}

/**
 * A 60s TTL cache keyed by userId, plus in-flight deduplication. This is the
 * AUTHORITATIVE membership read — the JWT's embedded `memberships` claim is a
 * fast path that goes stale (see lib/session.ts); never authorize off that one.
 *
 * ⚠ **This was deliberately UN-wrapped from React's `cache()` in the Phase-0
 * review, and it must not be re-wrapped.** Salon and Apparel both wrap the
 * equivalent function, and the combination is subtly broken: `cache()` memoizes
 * per REQUEST, and `ttlCache.delete()` in `createMembership` cannot reach that
 * memo. So within a single request the sequence
 *
 *     read -> [] , mint (FOOD, PROVIDER) , read -> STILL []
 *
 * returns a stale empty list — which is precisely Slice 13's shape (onboarding
 * submit mints the membership, then the dashboard guard re-reads it in the same
 * request). It is the same class of failure as trusting the stale JWT claim,
 * which `requireFoodSeller` exists to avoid.
 *
 * Worth knowing how this got missed: Slice 3's `verify-ecosystem.ts` asserts
 * "a read straight after a write is fresh, not 60s stale" and PASSES — but it
 * runs in a plain Node script, where `cache()` has no request scope and simply
 * calls through. The assertion never exercised the memoized path.
 *
 * The `inFlight` map below recovers the only thing `cache()` was actually
 * buying (concurrent callers sharing one fetch) without tying correctness to a
 * request scope this module cannot see or invalidate.
 */
export async function getMemberships(userId: string): Promise<EcosystemMembership[]> {
  const cached = ttlCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.memberships;
  }

  const existing = inFlight.get(userId);
  if (existing) return existing;

  const pending = fetchMemberships(userId)
    .then((memberships) => {
      ttlCache.set(userId, { memberships, expiresAt: Date.now() + TTL_MS });
      return memberships;
    })
    .finally(() => {
      inFlight.delete(userId);
    });

  inFlight.set(userId, pending);
  return pending;
}

export async function createMembership(input: {
  userId: string;
  vertical: EcosystemVertical;
  role: EcosystemMembershipRole;
}): Promise<void> {
  const res = await fetch(ecosystemUrl("/memberships"), {
    method: "POST",
    headers: ecosystemHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`ecosystem membership create failed: ${res.status}`);
  }
  // Bust the cache so a read immediately after this write is fresh. Both maps:
  // dropping only the TTL entry would let an in-flight read that started BEFORE
  // this write resolve afterwards and repopulate the cache with pre-write data.
  ttlCache.delete(input.userId);
  inFlight.delete(input.userId);
}

/**
 * Whether this user holds an ACTIVE `(FOOD, PROVIDER)` membership — the
 * membership-derived answer to "is this a seller". ⚠ The legacy global `role`
 * field cannot answer it: tie-up #1 keeps that field Demia/Social-scoped, so a
 * Food seller's global role stays `CLIENT`.
 */
export async function isFoodSeller(userId: string): Promise<boolean> {
  const memberships = await getMemberships(userId);
  return memberships.some(
    (m) => m.vertical === "FOOD" && m.role === "PROVIDER" && m.status === "ACTIVE"
  );
}

/**
 * Contract §6b — the per-vertical provider-registration toggle, read to gate
 * Food's own "become a seller" CTA.
 *
 * ⚠ Live state, re-checked 2026-07-30: decision 15 (2026-07-18) retired every
 * registration-time provider path, so this toggle no longer gates
 * *authorization* anywhere — portal-web's `evaluateRegistration` doesn't branch
 * on it at all. It survives purely as a CTA-visibility switch, which is exactly
 * how architecture Part B1 describes using it here. Real authorization happens
 * at Food's own onboarding submit (Slice 13). Do not treat this as a security
 * control.
 *
 * The FOOD row is seeded **false** (Demia migration 20260730170000, this slice),
 * matching the call Apparel made for its own row: onboarding doesn't exist until
 * Slice 13, and a CTA leading nowhere is worse than no CTA. Slice 13 flips it —
 * a data change, not a deploy.
 */
export interface ProviderRegistrationConfig {
  SOCIAL: boolean;
  SALON: boolean;
  APPAREL: boolean;
  FOOD: boolean;
}

const CONFIG_TTL_MS = 60_000;
const CONFIG_CACHE_KEY = "providerRegistration";
const configTtlCache = new Map<string, { config: ProviderRegistrationConfig; expiresAt: number }>();

const CONFIG_ALL_OFF: ProviderRegistrationConfig = {
  SOCIAL: false,
  SALON: false,
  APPAREL: false,
  FOOD: false,
};

export const getProviderRegistrationConfig = cache(async (): Promise<ProviderRegistrationConfig> => {
  const cached = configTtlCache.get(CONFIG_CACHE_KEY);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  // ⚠ Slice 16 finding: the comment below always said "fail CLOSED… rather
  // than throw", but only the `!res.ok` branch actually did that — `fetch`
  // itself throwing (ECONNREFUSED, DNS failure, any network-level failure,
  // as opposed to a reachable server returning a bad status) was never
  // caught, and propagated straight out of `<SiteFooter>` (Slice 7), which
  // calls this on every buyer-facing page. That crashed the ENTIRE `(client)`
  // route group with a 500 the moment the ecosystem API was unreachable —
  // reproduced directly, not inferred. The try/catch below is what actually
  // delivers the fail-closed behaviour this function already claimed to have.
  let res: Response;
  try {
    res = await fetch(ecosystemUrl("/config/registration"), {
      headers: ecosystemHeaders(),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[ecosystem] registration config fetch failed", err);
    return CONFIG_ALL_OFF;
  }
  if (!res.ok) {
    // Fail CLOSED on the CTA (hide it) rather than throw — a transient
    // ecosystem-API blip must not break the Food storefront, and hiding a CTA
    // degrades gracefully where a 500 does not. Deliberately not cached, so the
    // next request retries instead of holding a failure for 60s.
    return CONFIG_ALL_OFF;
  }
  const data = (await res.json()) as { providerRegistration: Partial<ProviderRegistrationConfig> };
  // Spread over the all-off default: portal-web returns keys only for verticals
  // in its own SelectableVertical list, so a key this app expects could simply
  // be absent. Absent must read as false, never undefined.
  const config: ProviderRegistrationConfig = { ...CONFIG_ALL_OFF, ...data.providerRegistration };
  configTtlCache.set(CONFIG_CACHE_KEY, { config, expiresAt: Date.now() + CONFIG_TTL_MS });
  return config;
});

/**
 * The write side, ported from Apoyo-Apparel's own `setApparelRegistrationEnabled`
 * (its Slice 16 — until then this toggle was migration-only, "a data change,
 * not a deploy" in name only, since nothing ever wrote it outside a
 * hand-authored SQL migration in Apoyo-Demia). Flips FOOD's own row via
 * portal-web's existing PATCH, scoped by the exact same `canWriteVertical`
 * containment membership writes already enforce — `food-app`'s token can only
 * ever flip its own vertical's row, never another's.
 *
 * Throws on failure rather than swallowing it (unlike the read side): the
 * admin control needs to know whether the flip actually landed, so it can
 * show an error instead of silently claiming success.
 */
export async function setFoodRegistrationEnabled(enabled: boolean): Promise<void> {
  const res = await fetch(ecosystemUrl("/config/registration"), {
    method: "PATCH",
    headers: ecosystemHeaders(),
    body: JSON.stringify({ vertical: "FOOD", enabled }),
  });
  if (!res.ok) {
    throw new Error(`registration config write failed: ${res.status}`);
  }
  // Bust the TTL cache so a read immediately after this write is fresh.
  configTtlCache.delete(CONFIG_CACHE_KEY);
}

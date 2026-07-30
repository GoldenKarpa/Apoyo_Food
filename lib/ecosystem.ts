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
 * Two caching layers, matching Salon and Apparel: React's per-request dedup
 * wraps a 60s cross-request TTL cache keyed by userId, so repeated reads across
 * nearby requests don't all round-trip. Writes bust the entry (see
 * `createMembership`), so a read immediately after a write is correct rather
 * than 60s stale.
 *
 * This is the AUTHORITATIVE membership read. The JWT's embedded `memberships`
 * claim is a fast path that goes stale (see lib/session.ts) — never authorize
 * off that one.
 */
export const getMemberships = cache(async (userId: string): Promise<EcosystemMembership[]> => {
  const cached = ttlCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.memberships;
  }
  const memberships = await fetchMemberships(userId);
  ttlCache.set(userId, { memberships, expiresAt: Date.now() + TTL_MS });
  return memberships;
});

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
  // Bust the TTL cache so a read immediately after this write sees it.
  ttlCache.delete(input.userId);
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
  const res = await fetch(ecosystemUrl("/config/registration"), {
    headers: ecosystemHeaders(),
    cache: "no-store",
  });
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

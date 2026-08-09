"use client";

/**
 * Client-side helpers for the cross-subdomain auth surface portal-web
 * exposes (architecture Part B1 — portal-web is the confirmed sole issuer;
 * Food never mints a session itself, only decodes the shared cookie, see
 * `lib/session.ts`). Direct port of the Apoyo-Demia app's own
 * `lib/portal-auth.ts`, which itself mirrors Apoyo-Salon's `lib/pca-auth.ts`
 * (same cross-origin-signIn problem, solved there first) — not invented
 * fresh here. There is no next-auth app instance on this side, so this talks
 * to portal-web's raw REST surface directly rather than `next-auth/react`'s
 * `signIn()`, which assumes same-origin endpoints.
 *
 * Deliberately narrower than both references for this pass: only
 * register + credentials login. Google sign-in and forgot/reset-password are
 * real, separable follow-ups, not built here — a signed-out visitor still
 * has a complete email/password path either way, and no UI in this app
 * links to a Google button or a forgot-password page that doesn't exist.
 */

const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? "";

export interface PortalAuthResult {
  ok: boolean;
  error?: "network_error" | "invalid_credentials" | "registration_failed";
  message?: string;
}

/**
 * Decision 15 (portal-web, applies ecosystem-wide): registration is
 * identity-only everywhere — no role/vertical field in the request, ever.
 * `evaluateRegistration` on the server derives the surface from the Origin
 * header alone and defaults every non-PORTAL surface's role to CLIENT.
 */
export async function registerPortal(input: {
  email: string;
  password: string;
  displayName: string;
  turnstileToken: string;
}): Promise<PortalAuthResult> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false, error: "registration_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

async function getPortalCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/auth/csrf`, { credentials: "include" });
    if (!res.ok) return null;
    const { csrfToken } = (await res.json()) as { csrfToken: string };
    return csrfToken;
  } catch {
    return null;
  }
}

/**
 * `redirect: "manual"` is required, not optional: per the fetch spec, once a
 * request is cross-origin its entire redirect chain stays subject to CORS,
 * even the hop that lands back on Food's own origin — and a plain Food page
 * route has no reason to send CORS headers back to itself. Confirmed by both
 * sibling ports (Salon, the Apoyo-Demia app) that `redirect: "follow"`
 * reliably throws `"Failed to fetch"` on that final hop even when sign-in
 * already succeeded server-side. The POST resolves to an opaque, unreadable
 * response that is simply discarded — the `Set-Cookie` header is still
 * processed into the cookie jar regardless of the response being opaque to
 * JS — and the session check below is the actual ground truth, not this
 * call's own outcome.
 */
export async function loginPortalCredentials(input: {
  email: string;
  password: string;
  turnstileToken: string;
  callbackUrl: string;
}): Promise<PortalAuthResult> {
  try {
    const csrfToken = await getPortalCsrfToken();
    if (!csrfToken) return { ok: false, error: "network_error" };

    const body = new URLSearchParams({
      email: input.email,
      password: input.password,
      turnstileToken: input.turnstileToken,
      csrfToken,
      callbackUrl: input.callbackUrl,
    });

    try {
      await fetch(`${PORTAL_BASE_URL}/api/auth/callback/credentials`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        redirect: "manual",
      });
    } catch {
      // Ignored — see the doc comment above.
    }

    const sessionRes = await fetch(`${PORTAL_BASE_URL}/api/auth/session`, { credentials: "include" });
    if (!sessionRes.ok) return { ok: false, error: "network_error" };
    const session = (await sessionRes.json()) as { user?: { id: string } } | null;
    if (session?.user?.id) return { ok: true };
    return { ok: false, error: "invalid_credentials" };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * Re-mints the caller's own session cookie with freshly-loaded ecosystem
 * memberships (portal-web's `/api/auth/refresh-session`).
 *
 * ⚠ Call this right after any action that mints a NEW `(FOOD, PROVIDER)`
 * membership (today: `onboardSeller`'s own success path) — that membership
 * lands in the identity DB immediately, but the seller's own JWT was issued
 * earlier and won't know about it until the token naturally refreshes, which
 * can otherwise take up to 30 days. Without this, Apoyo-Demia's own
 * middleware (which trusts the JWT's `memberships` claim rather than a live
 * read) keeps bouncing a genuine, freshly-onboarded provider off portal as
 * if they were still a plain client — found live 2026-08-09/10.
 *
 * Fire-and-forget by design: this is a same-request nicety, not a
 * correctness gate. Every REAL authorization check in this app already
 * reads live standing (`requireFoodSeller()`, `lib/ecosystem.ts`), so a
 * failed or skipped refresh here degrades to "the OLD staleness window",
 * never to a broken dashboard.
 */
export async function refreshPortalSession(): Promise<void> {
  try {
    await fetch(`${PORTAL_BASE_URL}/api/auth/refresh-session`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Ignored — see the doc comment above.
  }
}

/**
 * Sign out — **ecosystem-wide, and there is no other kind** (Slice 23).
 *
 * The session is one cookie on `.apoyolime.com`, minted by portal-web and
 * merely decoded here (`lib/session.ts`), so there is no Food-only session to
 * end: clearing it signs the person out of Food, Salon, Apparel, Social and
 * portal at once. Food cannot clear it locally either — the cookie is scoped
 * to the parent domain and set by a different origin, so only portal-web's own
 * endpoint can expire it. The UI's job is therefore to SAY so before calling
 * this, which `<AccountModal>`'s confirmation step does.
 *
 * Same `redirect: "manual"` + opaque-response handling as
 * `loginPortalCredentials` above, for the identical fetch-spec reason
 * documented there: next-auth's signout responds with a redirect, and once the
 * request is cross-origin that redirect stays subject to CORS. The
 * `Set-Cookie` that expires the session is still processed regardless of the
 * response being unreadable to JS, so the caller re-checks the session rather
 * than trusting this call's own outcome.
 */
export async function signOutPortal(): Promise<PortalAuthResult> {
  try {
    const csrfToken = await getPortalCsrfToken();
    if (!csrfToken) return { ok: false, error: "network_error" };

    try {
      await fetch(`${PORTAL_BASE_URL}/api/auth/signout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/" }).toString(),
        redirect: "manual",
      });
    } catch {
      // Ignored — see the doc comment above.
    }

    // Ground truth, exactly as the login path does it: ask portal whether a
    // session still exists rather than believing the opaque response.
    const sessionRes = await fetch(`${PORTAL_BASE_URL}/api/auth/session`, { credentials: "include" });
    if (!sessionRes.ok) return { ok: false, error: "network_error" };
    const session = (await sessionRes.json()) as { user?: { id: string } } | null;
    return session?.user?.id ? { ok: false, error: "network_error" } : { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

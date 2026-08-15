import crypto from "crypto";
import type { NextRequest } from "next/server";

// AS-S6 — inbound service-token auth for calls FROM portal-web.
//
// ⚠ This is net-new surface for this app, and the contract says so: every other
// ecosystem call this app takes part in is outbound (this app holds a
// token it presents to Portal). Contract §8 is the first portal→vertical
// direction, so this is the first time this app has to authenticate a caller rather
// than be one.
//
// Token model, and why it is a per-app env var rather than a shared list:
// Portal presents one outbound token (`PORTAL_OUTBOUND_SERVICE_TOKEN`), and §8
// requires that "a vertical must reject a token not scoped to it." Each vertical
// therefore checks the value against its OWN `PORTAL_INBOUND_SERVICE_TOKEN`. An
// operator may set the same secret everywhere today, but the code already
// supports distinct per-vertical secrets — tightening that is an env change with
// no code change, which is the property worth having.
//
// Fails closed: an unset env var rejects every call rather than accepting any.

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * True when the request carries Portal's service token.
 *
 * A browser session cookie riding along means this is not a legitimate
 * server-to-server call — the same guard portal-web's own inbound auth applies,
 * and it is what stops a logged-in admin's browser from being tricked into
 * making one of these calls cross-site.
 */
export function authenticatePortalCaller(req: NextRequest): boolean {
  if (req.cookies.getAll().some((c) => c.name.includes("session-token"))) return false;

  const expected = process.env.PORTAL_INBOUND_SERVICE_TOKEN;
  if (!expected) return false;

  const match = /^Bearer\s+(.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) return false;

  return timingSafeEqualStr(match[1], expected);
}

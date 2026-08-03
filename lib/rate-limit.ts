import type { NextRequest } from "next/server";

/**
 * In-memory fixed-window rate limiting (architecture Part G: "rate limits on
 * order creation, messages, Fresh Today posts, follows, and demand-event
 * ingestion (per user + per IP)").
 *
 * ⚠ Scope and honesty about it: this is **per-process** state. It is correct
 * today because `food-web` runs as a single PM2 fork — one process, one map. If
 * Food is ever scaled to cluster mode or a second instance, each process gets
 * its own counters and the effective limit multiplies by the instance count.
 * The fix at that point is a shared store (Redis/Postgres), not a bigger map;
 * this module's interface is deliberately small so that swap stays local.
 *
 * Fixed windows (not sliding) are a deliberate simplification: they allow a
 * burst of up to 2x the limit across a window boundary, which is irrelevant for
 * abuse control at this scale and costs a fraction of the memory and complexity
 * of a sliding log.
 */

interface Bucket {
  count: number;
  bytes: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound when many distinct keys appear once. */
function sweepExpired(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitRule {
  /** Max requests per window. */
  limit: number;
  windowMs: number;
  /** Optional max total bytes per window — the real defence against disk fill. */
  maxBytes?: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets — becomes the `Retry-After` header. */
  retryAfter: number;
  reason?: "requests" | "bytes";
}

export interface ChargeOptions {
  /** Bytes to add to this window's byte budget. */
  bytes?: number;
  /**
   * Whether this call counts as a request. Defaults to true.
   *
   * ⚠ Set `false` when charging bytes in a SECOND call for the same request —
   * otherwise one upload is billed as two requests and the effective request
   * limit silently halves. (Exactly that bug appeared in this module's first
   * draft, which is why the flag exists rather than a `bytes` positional.)
   */
  countRequest?: boolean;
}

/**
 * Charges a request and/or bytes against `key`, returning whether the caller is
 * still within `rule`.
 *
 * ⚠ Charges on EVERY call, including rejected ones — a caller being throttled
 * must not be able to hold their window open by continuing to hammer it.
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  { bytes = 0, countRequest = true }: ChargeOptions = {},
): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, bytes: 0, resetAt: now + rule.windowMs };
    buckets.set(key, bucket);
  }

  if (countRequest) bucket.count += 1;
  bucket.bytes += bytes;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > rule.limit) return { ok: false, retryAfter, reason: "requests" };
  if (rule.maxBytes !== undefined && bucket.bytes > rule.maxBytes) {
    return { ok: false, retryAfter, reason: "bytes" };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Client IP for per-IP limiting.
 *
 * Trusting `x-forwarded-for` is safe HERE specifically because nginx is the only
 * public edge and the app binds `127.0.0.1` (Part G; verified in production —
 * `ss` shows `127.0.0.1:3012`), so nothing external can reach this process to
 * forge the header. That premise is what makes this safe — if the app is ever
 * exposed directly, this becomes attacker-controlled and per-IP limiting
 * silently stops working.
 */
export function clientIp(req: NextRequest): string {
  return clientIpFromHeaders(req.headers);
}

/**
 * The same read, for a Server Action — which never receives a `NextRequest`,
 * only whatever `next/headers`' `headers()` hands back. Added at Slice 17 for
 * `createOrderRequest`; `clientIp` above is now a thin wrapper over this so
 * the two can never drift.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Media uploads. Generous for a real seller, useless for filling a disk. */
export const UPLOAD_RULE_PER_USER: RateLimitRule = {
  limit: 20,
  windowMs: 10 * 60 * 1000,
  maxBytes: 60 * 1024 * 1024,
};

/**
 * Per-IP is the wider net, since one attacker may hold several accounts. It is
 * deliberately NOT much larger than the per-user rule: a shared NAT would have
 * to see several sellers uploading heavily in the same 10 minutes to collide.
 */
export const UPLOAD_RULE_PER_IP: RateLimitRule = {
  limit: 40,
  windowMs: 10 * 60 * 1000,
  maxBytes: 120 * 1024 * 1024,
};

/**
 * Order creation (Part G: "rate limits on order creation... per user + per
 * IP"), Slice 17's own scope. Generous for a real buyer placing a handful of
 * genuine requests, useless for scripting `respondBy`-spam against a seller's
 * inbox. Per-IP is the wider net, same reasoning as `UPLOAD_RULE_PER_IP`.
 */
export const ORDER_CREATE_RULE_PER_USER: RateLimitRule = { limit: 10, windowMs: 60 * 60 * 1000 };
export const ORDER_CREATE_RULE_PER_IP: RateLimitRule = { limit: 20, windowMs: 60 * 60 * 1000 };

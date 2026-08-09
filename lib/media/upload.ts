import { NextRequest, NextResponse } from "next/server";
import { getFoodSession } from "@/lib/session";
import { INGEST_PRESETS, isIngestPreset } from "@/lib/media/ingest";
import { maxUploadBytes } from "@/lib/media/validate";
import {
  checkRateLimit,
  clientIp,
  UPLOAD_RULE_PER_IP,
  UPLOAD_RULE_PER_USER,
  type RateLimitResult,
} from "@/lib/rate-limit";

/**
 * Server-mediated upload (architecture Part C): browser → this route → validate
 * → sharp variants → storage. **Deliberately not presigned direct-to-bucket**,
 * and the reason is a security one, not a convenience one: a direct-to-storage
 * upload would let a client put bytes in the bucket without the variant
 * pipeline or the EXIF strip ever running. Routing every byte through here is
 * what makes "no raw uploads anywhere" true rather than aspirational.
 *
 * Shared by BOTH the buyer-reachable `/api/media/upload` route and the
 * seller-reachable `/api/food/media/upload` route (ecosystem ruling E14) —
 * this route has real callers on both surfaces (order-message attachments,
 * Fresh Today posts), so one handler for both keeps them from drifting.
 *
 * ⚠ Auth: any authenticated user may upload. Per-resource ownership — "is this
 * YOUR listing / YOUR profile / YOUR Fresh Today post" — is enforced by the
 * slices that own those resources (13/14/15), because the resource doesn't
 * exist yet to be owned. What this route guarantees now is that an ANONYMOUS
 * request can never write to storage, which is the part that must not wait.
 *
 * ⚠ Rate limited per user AND per IP, by request count and by total bytes
 * (Part G). Added in the Phase-0 review rather than deferred: "no real users
 * yet" is not protection — the site is publicly reachable, and an authenticated
 * stranger with bad intent could otherwise fill the disk one 10 MB image at a
 * time. Registration is open across the ecosystem, so "authenticated" is a low
 * bar to clear.
 */
export async function handleMediaUpload(req: NextRequest): Promise<NextResponse> {
  const session = await getFoodSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Charged before the body is read, so a flood of oversized requests is cut off
  // at the count limit without ever being buffered into memory.
  const ip = clientIp(req);
  const userGate = checkRateLimit(`upload:user:${session.userId}`, UPLOAD_RULE_PER_USER);
  if (!userGate.ok) return tooMany(userGate);
  const ipGate = checkRateLimit(`upload:ip:${ip}`, UPLOAD_RULE_PER_IP);
  if (!ipGate.ok) return tooMany(ipGate);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "VALIDATION", detail: "Expected multipart/form-data" }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "");
  if (!isIngestPreset(kind)) {
    return NextResponse.json(
      { error: "VALIDATION", detail: `Unknown upload kind "${kind}"` },
      { status: 422 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "VALIDATION", detail: "Missing file" }, { status: 422 });
  }

  // Cheap pre-check off the declared size, so an oversized upload is rejected
  // before it is buffered into memory. `assertImageUploadValid` re-checks the
  // real byte length inside the pipeline — the declared size is client input
  // and is not trusted on its own.
  if (file.size > maxUploadBytes()) {
    return NextResponse.json(
      { error: "VALIDATION", detail: `File exceeds ${Math.floor(maxUploadBytes() / (1024 * 1024))} MB limit` },
      { status: 413 },
    );
  }

  // Charge the byte budget now that the size is known. This is the limit that
  // actually bounds disk growth — a request cap alone still permits
  // (cap x MAX_UPLOAD_MB) per window.
  // `countRequest: false` — the request itself was already counted above; this
  // call only adds to the byte budget.
  const charge = { bytes: file.size, countRequest: false };
  const userBytes = checkRateLimit(`upload:user:${session.userId}`, UPLOAD_RULE_PER_USER, charge);
  if (!userBytes.ok) return tooMany(userBytes);
  const ipBytes = checkRateLimit(`upload:ip:${ip}`, UPLOAD_RULE_PER_IP, charge);
  if (!ipBytes.ok) return tooMany(ipBytes);

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await INGEST_PRESETS[kind](buffer, file.type);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    // Validation failures from the pipeline (bad magic bytes, disallowed type,
    // oversized) are caller-safe messages by construction — see
    // lib/media/validate.ts. Anything else is reported generically.
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: "VALIDATION", detail: message }, { status: 422 });
  }
}

function tooMany(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "RATE_LIMITED",
      detail:
        result.reason === "bytes"
          ? "Upload size limit reached. Please try again shortly."
          : "Too many uploads. Please try again shortly.",
    },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
  );
}

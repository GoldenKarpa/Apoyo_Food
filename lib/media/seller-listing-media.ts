import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOwnListing } from "@/lib/listing";
import { ingestMealPhoto } from "@/lib/media/ingest";
import { maxUploadBytes } from "@/lib/media/validate";
import { MAX_LISTING_PHOTOS } from "@/lib/listing-form";
import {
  checkRateLimit,
  clientIp,
  UPLOAD_RULE_PER_IP,
  UPLOAD_RULE_PER_USER,
  type RateLimitResult,
} from "@/lib/rate-limit";

/**
 * `FoodListingPhoto` upload — `lib/media/seller-media.ts`'s shape, one relation
 * hop further out (Slice 13's rationale for that route applies unchanged:
 * ingest and persist in ONE ownership-checked request, so the browser never
 * handles a storage key it could substitute for one it doesn't own).
 *
 * Shared by `/api/seller/listing-media` (local dev / direct
 * `food.apoyolime.com` access) and `/api/food/seller/listing-media` (the
 * seller dashboard's real production path, ecosystem ruling E14).
 *
 * ⚠ Ownership here is TWO checks, not one: `requireOwnListing(listingId)`
 * confirms the caller owns a seller row, and THAT the named listing belongs to
 * it — a listing id lifted from another seller's edit-page URL resolves to
 * "not found" here exactly as it does in every listing Server Action.
 *
 * Rate-limited under the SAME buckets as seller-media (`seller-media:*`)
 * rather than a second set — a seller flooding the disk via listing photos
 * instead of profile photos is still one seller flooding the disk, and two
 * independent budgets would double the effective limit.
 */
export async function handleSellerListingMediaUpload(req: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "VALIDATION", detail: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const listingId = String(form.get("listingId") ?? "");
  if (!listingId) {
    return NextResponse.json({ error: "VALIDATION", detail: "Missing listingId" }, { status: 422 });
  }

  const ctx = await requireOwnListing(listingId);
  // One response for "not signed in", "signed in but not a seller" and "not
  // your listing" — distinguishing them would let a prober learn which
  // listing ids exist and who owns them.
  if (!ctx) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const ip = clientIp(req);
  const userGate = checkRateLimit(`seller-media:user:${ctx.seller.userId}`, UPLOAD_RULE_PER_USER);
  if (!userGate.ok) return tooMany(userGate);
  const ipGate = checkRateLimit(`seller-media:ip:${ip}`, UPLOAD_RULE_PER_IP);
  if (!ipGate.ok) return tooMany(ipGate);

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "VALIDATION", detail: "Missing file" }, { status: 422 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json(
      {
        error: "VALIDATION",
        detail: `File exceeds ${Math.floor(maxUploadBytes() / (1024 * 1024))} MB limit`,
      },
      { status: 413 },
    );
  }

  const charge = { bytes: file.size, countRequest: false };
  const userBytes = checkRateLimit(`seller-media:user:${ctx.seller.userId}`, UPLOAD_RULE_PER_USER, charge);
  if (!userBytes.ok) return tooMany(userBytes);
  const ipBytes = checkRateLimit(`seller-media:ip:${ip}`, UPLOAD_RULE_PER_IP, charge);
  if (!ipBytes.ok) return tooMany(ipBytes);

  const count = await prisma.foodListingPhoto.count({ where: { listingId } });
  if (count >= MAX_LISTING_PHOTOS) {
    return NextResponse.json(
      { error: "VALIDATION", detail: `A listing is limited to ${MAX_LISTING_PHOTOS} photos` },
      { status: 422 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let paths;
  try {
    paths = await ingestMealPhoto(buffer, file.type);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: "VALIDATION", detail: message }, { status: 422 });
  }

  const last = await prisma.foodListingPhoto.findFirst({
    where: { listingId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.foodListingPhoto.create({
    data: { listingId, ...paths, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
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

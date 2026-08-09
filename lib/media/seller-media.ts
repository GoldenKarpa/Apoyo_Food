import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { deleteMedia } from "@/lib/storage";
import { ingestSellerAvatar, ingestSellerCover, ingestSellerGalleryPhoto } from "@/lib/media/ingest";
import { maxUploadBytes } from "@/lib/media/validate";
import { MAX_GALLERY_PHOTOS } from "@/lib/seller-profile";
import {
  checkRateLimit,
  clientIp,
  UPLOAD_RULE_PER_IP,
  UPLOAD_RULE_PER_USER,
  type RateLimitResult,
} from "@/lib/rate-limit";

/**
 * Seller media: avatar, cover and gallery photos — upload AND persist in one
 * ownership-checked request.
 *
 * This route has no buyer-surface caller — it is only ever reached from
 * `portal.apoyolime.com/food` (the seller dashboard) — but it still needs a
 * namespaced sibling under `/api/food/*` (ecosystem ruling E14), since that is
 * the only API prefix nginx proxies to this app on the portal host. This
 * handler is shared by both `/api/seller/media` (kept for local dev / direct
 * access to `food.apoyolime.com`) and `/api/food/seller/media`.
 *
 * ⚠ Why this exists alongside `/api/media/upload` rather than reusing it. That
 * route returns storage keys to the browser and leaves persistence to the
 * caller; a seller form built on it would have to POST those keys back to be
 * written onto the row, and a client that can name the key it wants stored can
 * name a key it does not own. Harmless for public dish photography, but it is a
 * "trust the client's pointer" shape, and this is the slice where seller-owned
 * resources first exist. Doing both halves here means the only key ever written
 * to a `FoodSeller` row is one this request just produced.
 * `/api/media/upload` stays as-is for Slices 14/15, whose resources are still
 * unbuilt.
 *
 * ⚠ Every byte still goes through the Slice 4 pipeline, which is what makes
 * Part G's hard requirement true here: **EXIF (including GPS) is stripped at
 * ingest**. Home cooks photograph food in their homes — a geotagged profile
 * photo is a doxxed kitchen, and that is not an abstract risk on a product
 * whose fulfilment model is "come to my house".
 *
 * ⚠ Replacing an avatar or cover DELETES the previous variants from storage.
 * Without that, every re-upload during a seller's first ten minutes of fiddling
 * leaves three orphaned files on disk forever, and nothing ever collects them.
 */

type SellerMediaKind = "avatar" | "cover" | "gallery";

function isSellerMediaKind(v: string): v is SellerMediaKind {
  return v === "avatar" || v === "cover" || v === "gallery";
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

export async function handleSellerMediaUpload(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireOwnSeller();
  // One response for "not signed in" and "signed in but not a seller": this
  // route is only ever reached from the seller surface, and distinguishing them
  // would tell an anonymous prober whether a given account sells food.
  if (!ctx) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { seller } = ctx;

  const ip = clientIp(req);
  const userGate = checkRateLimit(`seller-media:user:${seller.userId}`, UPLOAD_RULE_PER_USER);
  if (!userGate.ok) return tooMany(userGate);
  const ipGate = checkRateLimit(`seller-media:ip:${ip}`, UPLOAD_RULE_PER_IP);
  if (!ipGate.ok) return tooMany(ipGate);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "VALIDATION", detail: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const kind = String(form.get("kind") ?? "");
  if (!isSellerMediaKind(kind)) {
    return NextResponse.json({ error: "VALIDATION", detail: "Unknown kind" }, { status: 422 });
  }

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

  // `countRequest: false` — the request was already counted above; this call
  // only adds to the byte budget (the Phase-0 review's rate-limit finding).
  const charge = { bytes: file.size, countRequest: false };
  const userBytes = checkRateLimit(`seller-media:user:${seller.userId}`, UPLOAD_RULE_PER_USER, charge);
  if (!userBytes.ok) return tooMany(userBytes);
  const ipBytes = checkRateLimit(`seller-media:ip:${ip}`, UPLOAD_RULE_PER_IP, charge);
  if (!ipBytes.ok) return tooMany(ipBytes);

  if (kind === "gallery") {
    const count = await prisma.foodSellerPhoto.count({ where: { sellerId: seller.id } });
    if (count >= MAX_GALLERY_PHOTOS) {
      return NextResponse.json(
        { error: "VALIDATION", detail: `Gallery is limited to ${MAX_GALLERY_PHOTOS} photos` },
        { status: 422 },
      );
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let paths;
  try {
    paths =
      kind === "avatar"
        ? await ingestSellerAvatar(buffer, file.type)
        : kind === "cover"
          ? await ingestSellerCover(buffer, file.type)
          : await ingestSellerGalleryPhoto(buffer, file.type);
  } catch (e) {
    // Pipeline validation failures carry caller-safe messages by construction
    // (lib/media/validate.ts); anything else is reported generically.
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: "VALIDATION", detail: message }, { status: 422 });
  }

  if (kind === "gallery") {
    const last = await prisma.foodSellerPhoto.findFirst({
      where: { sellerId: seller.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.foodSellerPhoto.create({
      data: {
        sellerId: seller.id,
        ...paths,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const previous =
    kind === "avatar"
      ? [seller.profileImageThumb, seller.profileImageCard, seller.profileImageFull]
      : [seller.coverImageThumb, seller.coverImageCard, seller.coverImageFull];

  await prisma.foodSeller.update({
    where: { id: seller.id },
    data:
      kind === "avatar"
        ? {
            profileImageThumb: paths.pathThumb,
            profileImageCard: paths.pathCard,
            profileImageFull: paths.pathFull,
            profileImageBlur: paths.blurDataUrl,
          }
        : {
            coverImageThumb: paths.pathThumb,
            coverImageCard: paths.pathCard,
            coverImageFull: paths.pathFull,
            coverImageBlur: paths.blurDataUrl,
          },
  });

  // Only after the row points at the new files — a crash between ingest and
  // update must not leave the row pointing at files that no longer exist.
  await Promise.all(previous.filter((k): k is string => !!k).map((k) => deleteMedia(k)));

  return NextResponse.json({ ok: true }, { status: 201 });
}

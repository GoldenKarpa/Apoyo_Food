import type { NextRequest } from "next/server";
import { handleSellerListingMediaUpload } from "@/lib/media/seller-listing-media";

/**
 * The **seller surface's** listing-photo upload (ecosystem ruling E14). The
 * seller dashboard renders via `portal.apoyolime.com/food` in production,
 * where nginx proxies only `/food/*` and `/api/food/*` — the bare
 * `/api/seller/listing-media` this route mirrors is unreachable from there.
 * Same handler (`lib/media/seller-listing-media.ts`); see
 * `lib/media-url.ts`'s `SELLER_LISTING_MEDIA_UPLOAD_URL` for the one place
 * this path is named.
 */
export async function POST(req: NextRequest) {
  return handleSellerListingMediaUpload(req);
}

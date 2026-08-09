import type { NextRequest } from "next/server";
import { handleSellerMediaUpload } from "@/lib/media/seller-media";

/**
 * The **seller surface's** avatar/cover/gallery upload (ecosystem ruling E14).
 * The seller dashboard renders via `portal.apoyolime.com/food` in production,
 * where nginx proxies only `/food/*` and `/api/food/*` — the bare
 * `/api/seller/media` this route mirrors is unreachable from there. Same
 * handler (`lib/media/seller-media.ts`); see `lib/media-url.ts`'s
 * `SELLER_MEDIA_UPLOAD_URL` for the one place this path is named.
 */
export async function POST(req: NextRequest) {
  return handleSellerMediaUpload(req);
}

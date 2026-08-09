import type { NextRequest } from "next/server";
import { handleSellerMediaUpload } from "@/lib/media/seller-media";

/**
 * Kept for local dev / direct access to `food.apoyolime.com`. The seller
 * dashboard itself only ever renders via `portal.apoyolime.com/food` in
 * production, which calls `/api/food/seller/media` instead (ecosystem ruling
 * E14) — see `lib/media/seller-media.ts` for the shared handler and
 * `lib/media-url.ts` for choosing between them.
 */
export async function POST(req: NextRequest) {
  return handleSellerMediaUpload(req);
}

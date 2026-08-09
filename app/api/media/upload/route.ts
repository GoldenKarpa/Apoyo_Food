import type { NextRequest } from "next/server";
import { handleMediaUpload } from "@/lib/media/upload";

/**
 * Buyer-reachable generic upload route (`food.apoyolime.com`'s own domain
 * proxies every path here — §6a). See `lib/media/upload.ts` for the actual
 * handler, shared with `/api/food/media/upload` (ecosystem ruling E14) —
 * never build either path by hand, use `lib/media-url.ts`.
 */
export async function POST(req: NextRequest) {
  return handleMediaUpload(req);
}

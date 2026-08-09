import type { NextRequest } from "next/server";
import { serveMedia } from "@/lib/media/serve";

/**
 * Public media serve route for the **buyer storefront**
 * (`food.apoyolime.com`, whose own domain proxies every path here — §6a).
 *
 * ⚠ Reachable on `food.apoyolime.com` only. The seller surface lives on the
 * portal host, where nginx proxies just `/food/*` and `/api/food/*` — it uses
 * `/api/food/media/*` instead (ecosystem ruling E14). Both routes share
 * `lib/media/serve.ts`; see `lib/media-url.ts` for choosing between them.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  return serveMedia(segments);
}

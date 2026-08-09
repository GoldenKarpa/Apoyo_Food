import type { NextRequest } from "next/server";
import { handleMediaUpload } from "@/lib/media/upload";

/**
 * The **seller surface's** copy of the generic upload route (ecosystem ruling
 * E14). Order-message attachments and Fresh Today photos can both originate
 * from a seller-surface page (`portal.apoyolime.com/food/*`), where nginx
 * proxies only `/food/*` and `/api/food/*` — a bare `/api/media/upload` call
 * from there resolves against portal-web and 500s with nothing in this app's
 * own error log. Same handler as `/api/media/upload` (`lib/media/upload.ts`);
 * see `lib/media-url.ts` for choosing between them.
 */
export async function POST(req: NextRequest) {
  return handleMediaUpload(req);
}

import { NextRequest, NextResponse } from "next/server";

// Host-gating per Apoyo_Food_Architecture.md Part B2 / F1. Two surfaces share
// one build, mirroring Salon's and Apparel's proven arrangement exactly:
//   - food.apoyolime.com    -> client marketplace, the (client) route group
//   - portal.apoyolime.com  -> seller dashboard + admin; nginx proxies /food/*
//                              and /api/* here
//
// The /food nesting exists from the first commit for exactly this reason —
// retrofitting a path prefix after pages exist is the expensive version.
export default function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const host = req.headers.get("host") ?? "";
  const isFoodPath = nextUrl.pathname.startsWith("/food");
  const isApiPath = nextUrl.pathname.startsWith("/api");

  // food.* -> block the seller surface; only (client) is reachable.
  if (host.startsWith("food.") && isFoodPath) {
    return new NextResponse(null, { status: 404 });
  }

  // portal.* -> only the seller surface + API are ours. portal-web, the
  // Apoyo-Demia app and the other verticals own the rest of that host.
  if (host.startsWith("portal.") && !isFoodPath && !isApiPath) {
    return new NextResponse(null, { status: 404 });
  }

  // Unknown host (local dev without a matching Host header) -> everything
  // reachable, so localhost:3012/... works for both surfaces without DNS setup.

  // Drives the default locale (client = en, seller dashboard = es) in
  // i18n/request.ts before any NEXT_LOCALE cookie exists. Keyed on the PATH,
  // not the host, so it is also correct on the unknown-host dev case above.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-food-surface", isFoodPath ? "seller" : "client");

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

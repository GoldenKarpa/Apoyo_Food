import { NextRequest, NextResponse } from "next/server";

// Smoke-test target for the Slice 6 deploy verification — confirms the app is
// reachable and that middleware's host/surface detection is working.
//
// Note (not a bug): this path sits outside /food, so it always reports surface
// "client" regardless of host. Correct — it is shared infra for both surfaces,
// not part of the seller prefix. Salon and Apparel both record the same.
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ok",
    app: "food-web",
    host: req.headers.get("host"),
    surface: req.headers.get("x-food-surface"),
  });
}

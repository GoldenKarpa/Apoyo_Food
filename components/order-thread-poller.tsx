"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * "Polling refresh on the open order page" (Slice 18, architecture E6:
 * "fetch-on-load + light polling ... MVP -> ws upgrade Phase 9, same table").
 * `router.refresh()` re-runs the current route's Server Components against
 * fresh data — cheap here since the whole order-detail page is already a
 * single scoped query, and it's the same freshness mechanism every mutation
 * in this app already relies on (`<AdminActionButton>` etc.), just on a timer
 * instead of after a click. Renders nothing; mount/unmount is the whole API.
 */
export function OrderThreadPoller({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();

  React.useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}

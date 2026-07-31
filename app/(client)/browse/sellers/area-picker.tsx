"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { RegionKey } from "@prisma/client";

import { RegionMap } from "@/components/region-map";
import { AREA_COOKIE, AREA_COOKIE_MAX_AGE } from "@/lib/regions";

/**
 * The seller directory's area filter.
 *
 * Two things happen on a selection, and the second is easy to miss:
 *  1. the URL gains `?area=…`, so a filtered directory is shareable like every
 *     other browse surface (Part E1);
 *  2. the **`food_area` cookie is written**, which is what Part E1 section 6's
 *     "sellers near you" on the home page reads. Choosing an area here is the
 *     area-picker flow for the whole site, not just for this page — otherwise a
 *     visitor would have to declare where they are twice.
 *
 * The cookie is written client-side rather than through a server action because
 * it carries no authority: it reorders a rail and nothing else, so a signed
 * cookie would be ceremony. `router.refresh()` re-runs the server components
 * that read it.
 */
export function AreaPicker({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const selected = (params.get("area")?.split(",").filter(Boolean) ?? []) as RegionKey[];

  function toggle(key: RegionKey) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];

    // The home rail shows ONE area, so the cookie takes the most recent choice.
    if (next.length > 0) {
      document.cookie = `${AREA_COOKIE}=${next[next.length - 1]}; path=/; max-age=${AREA_COOKIE_MAX_AGE}; SameSite=Lax`;
    }

    const query = new URLSearchParams(params.toString());
    if (next.length > 0) query.set("area", next.join(","));
    else query.delete("area");

    const qs = query.toString();
    startTransition(() => router.push(qs ? `/browse/sellers?${qs}` : "/browse/sellers", { scroll: false }));
  }

  return <RegionMap selected={selected} onToggle={toggle} counts={counts} />;
}

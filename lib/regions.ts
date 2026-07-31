import type { RegionKey } from "@prisma/client";

/**
 * Trinidad & Tobago service areas (architecture Part C).
 *
 * Ported from the Apoyo-Demia app's `components/questions/region-map.tsx`, which
 * Salon and Apparel also reuse — **the same eight `RegionKey` values across
 * every vertical**, so a provider who works "Central" means the same thing
 * everywhere in the ecosystem. The geometry itself is
 * `lib/tt-region-paths.ts`, copied verbatim and auto-generated; do not hand-edit
 * it.
 *
 * ⚠ **Areas are the ONLY location this product ever exposes publicly** (Part G).
 * A cook's exact address is exchanged in the order thread after acceptance and
 * never appears on a listing, a profile or a card — pickup means a customer
 * visiting someone's home kitchen, which makes this the highest-stakes privacy
 * rule in the app. Nothing in this module resolves finer than a region.
 */

/** Display order — roughly north-west to south-east, then Tobago. */
export const REGION_KEYS: RegionKey[] = [
  "north_west",
  "east_west_corridor",
  "central",
  "south_central",
  "south_west",
  "north_east",
  "south_east",
  "tobago",
];

export function isRegionKey(value: string | undefined | null): value is RegionKey {
  return !!value && (REGION_KEYS as string[]).includes(value);
}

/**
 * Each UX region groups one or more administrative-area paths from the source
 * SVG. Copied from the Apoyo-Demia app so the two maps cannot drift.
 */
export const REGION_ADMIN_IDS: Record<RegionKey, string[]> = {
  north_west: ["TTPOS", "TTDMN"],
  east_west_corridor: ["TTSJL", "TTTUP", "TTARI"],
  central: ["TTCHA", "TTCTT"],
  south_central: ["TTSFO", "TTPRT", "TTPED"],
  south_west: ["TTPTF", "TTSIP"],
  north_east: ["TTSGE"],
  south_east: ["TTMRC"],
  tobago: ["TTTOB"],
};

/**
 * Place names shown under a region — a visual hint of what it covers.
 * Deliberately **not localised**: these are proper nouns, and "Port of Spain"
 * is "Port of Spain" in both catalogues.
 */
export const REGION_SUBAREAS: Record<RegionKey, string[]> = {
  north_west: ["Port of Spain", "Diego Martin", "St. James", "Maraval"],
  east_west_corridor: ["Barataria", "St. Joseph", "Tunapuna", "Arima"],
  central: ["Chaguanas", "Cunupia", "Couva", "Freeport"],
  south_central: ["San Fernando", "Gasparillo", "Princes Town", "Penal"],
  south_west: ["Point Fortin", "La Brea", "Fyzabad", "Siparia", "Cedros"],
  north_east: ["Sangre Grande", "Valencia", "Toco"],
  south_east: ["Mayaro", "Rio Claro", "Manzanilla"],
  tobago: ["Scarborough", "Crown Point", "Parlatuvier", "Roxborough", "Charlotteville"],
};

/**
 * The cookie holding "sellers near you" (Part E1 section 6: "area match on the
 * customer's chosen region, persisted in cookie/profile").
 *
 * A cookie rather than a query param because the choice must survive navigation
 * across the whole surface, and a plain readable value rather than anything
 * signed because it carries no authority — it only reorders a rail.
 */
export const AREA_COOKIE = "food_area";
export const AREA_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

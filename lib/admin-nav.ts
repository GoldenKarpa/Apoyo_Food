// Admin navigation registry — MIRROR of portal-web's composition contract
// (UAS-S2), extended here for Food exactly as Salon's and Apparel's own
// copies were (UAS-S3's worked example; Apparel Slice 16 is the more recent
// one this file was built from).
//
// The authoritative copy lives in Apoyo-Portal (`portal-web/lib/admin-nav.ts`).
// Food can't import from portal-web (separate apps, no shared package until
// Phase H), so it mirrors the SHAPE + the vertical-admin URL convention so the
// shared shell chrome renders identically here (nav-contract item 5).
// ⚠ Keep in sync with the authoritative copy until Phase H extracts it.
//
// Vertical-admin URL convention (arch decision 1): every vertical composes
// same-origin at portal.apoyolime.com/<vertical>/admin — generic over all
// verticals, no per-vertical special-case. Ecosystem entries are portal-host
// paths served by portal-web; from Food they're cross-app (rendered as plain
// <a>). Demia is the carve-out (pending its /demia/admin/* re-root).

export type AdminOwnerApp = "portal" | "demia" | "salon" | "apparel" | "food";
export type AdminNavGroup = "Ecosystem" | "Demia" | "Salon" | "Apparel" | "Food";

export interface AdminNavEntry {
  label: string;
  group: AdminNavGroup;
  ownerApp: AdminOwnerApp;
  url: string;
  external?: boolean;
  pending?: boolean;
  slice?: string;
}

export interface AdminNavGroupDef {
  group: AdminNavGroup;
  entries: AdminNavEntry[];
}

export const ADMIN_HOME_URL = "/admin";

export function verticalAdminUrl(vertical: Exclude<AdminOwnerApp, "portal">): string {
  return `/${vertical}/admin`;
}

export const adminNav: AdminNavGroupDef[] = [
  {
    group: "Ecosystem",
    entries: [
      { label: "Staged registrations", group: "Ecosystem", ownerApp: "portal", url: "/admin/staged-registrations" },
      { label: "Users", group: "Ecosystem", ownerApp: "portal", url: "/admin/users" },
      { label: "Memberships", group: "Ecosystem", ownerApp: "portal", url: "/admin/memberships" },
      { label: "Providers (identity)", group: "Ecosystem", ownerApp: "portal", url: "/admin/providers" },
      { label: "Audit log", group: "Ecosystem", ownerApp: "portal", url: "/admin/audit", slice: "Stage C (decision 2)" },
      { label: "Platform payments", group: "Ecosystem", ownerApp: "portal", url: "/admin/platform-payments", slice: "Stage C (decision 2)" },
    ],
  },
  {
    group: "Demia",
    entries: [
      {
        label: "Demia product-admin",
        group: "Demia",
        ownerApp: "demia",
        url: verticalAdminUrl("demia"),
        external: true,
        pending: true,
        slice: "UAS-S3 (after /demia/admin/* re-root)",
      },
    ],
  },
  {
    group: "Salon",
    entries: [
      { label: "Salon product-admin", group: "Salon", ownerApp: "salon", url: verticalAdminUrl("salon"), external: true },
    ],
  },
  {
    group: "Apparel",
    entries: [
      { label: "Apparel product-admin", group: "Apparel", ownerApp: "apparel", url: verticalAdminUrl("apparel"), external: true },
    ],
  },
  {
    group: "Food",
    entries: [
      { label: "Food product-admin", group: "Food", ownerApp: "food", url: verticalAdminUrl("food"), external: true },
    ],
  },
];

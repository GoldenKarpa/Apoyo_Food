// Admin navigation registry — the composition contract (UAS-S2).
//
// ⚠ THIS FILE IS DUPLICATED, BY DESIGN, AND MUST STAY BYTE-IDENTICAL in all four
// apps that render the shared admin shell:
//   Apoyo-Portal/portal-web/lib/admin-nav.ts   (edit here first)
//   Apoyo-Salon/lib/admin-nav.ts
//   Apoyo-Food/lib/admin-nav.ts
//   Apoyo-Apparel/lib/admin-nav.ts
// There is no shared package until Phase H; a plain `diff` between any two of
// them must come back empty. Edit all four or none.
//
// ── Why the rule changed here (2026-08-15) ──────────────────────────────────
// These four copies used to be *shape mirrors* — "same entries, no descriptions,
// keep in sync" — and every one of them had silently drifted:
//
//   copy        Launch control   Apparel entry   Food entry
//   portal-web        ✅              ✅             ✅
//   Food              ❌              ✅             ✅
//   Apparel           ❌              ✅             ❌
//   Salon             ❌              ❌             ❌
//
// Each froze at the moment its app was built, and `Launch control` (LC-3) was
// only ever added to portal-web — so an admin's sidebar silently changed shape
// depending on which vertical's page they happened to be standing on, and Launch
// control was unreachable from three of the four. Salon's copy could not even
// express the missing entries: its `AdminOwnerApp` union omitted "apparel" and
// "food", so they were structurally unrepresentable rather than merely absent.
//
// This is ecosystem ruling E15 ("adding a vertical means widening EVERY
// allowlist, and they are not co-located") landing on the nav registry. "Mirror
// the shape and remember to update" is the rule that failed. Byte-identical is
// the rule that can be *checked* — the same one `lib/onboarding-fields.ts`
// carries, which has held. The verticals do not use `description` or the two
// lookup exports at the bottom; they are carried anyway, because a file you can
// verify with `diff` is worth more than a few hundred bytes of unused data.
//
// Ecosystem entries are native Portal routes; vertical entries point at the
// owning app's pages on the portal host. From a vertical, ecosystem entries are
// cross-app and render as plain <a> — which the shared shell already does for
// every entry, so nothing here needs to know which app is rendering it.
//
// Vertical-admin URL convention (arch decision 1, user ruling 2026-07-26):
// every vertical's product-admin composes SAME-ORIGIN under the portal host at
//   portal.apoyolime.com/<vertical>/admin
// generic over ALL verticals — do NOT special-case any one of them. Demia is the
// deliberate CARVE-OUT: its **admin** routes are still unprefixed (`/admin/*`) on
// the portal host, so it has no stable composed URL yet. It's listed as `pending`
// so UAS never blocks on Demia's reorg.
// ⚠ Corrected 2026-07-29: this used to say the whole `/demia/*` re-root was
// deferred. It was not — D-S4 re-rooted the PROVIDER surface on 2026-07-19
// (`app/demia/dashboard/provider`, `app/demia/chat`); only admin is outstanding.
// See register #4.

export type AdminOwnerApp = "portal" | "demia" | "salon" | "apparel" | "food";
export type AdminNavGroup = "Ecosystem" | "Demia" | "Salon" | "Apparel" | "Food";

export interface AdminNavEntry {
  /** Human label shown in the sidebar and the Admin-home card. */
  label: string;
  /** Sidebar grouping — owner-scoped. */
  group: AdminNavGroup;
  /** Which app owns and serves the page. */
  ownerApp: AdminOwnerApp;
  /** Ecosystem: a Portal route. Vertical: the owning app's path on the portal host. */
  url: string;
  /** True when the owning app (not Portal) renders it — shared chrome composed in UAS-S3. */
  external?: boolean;
  /** Not yet reachable (carve-out or unbuilt) — rendered non-interactive, never a dead-end link. */
  pending?: boolean;
  /** Slice that delivers / composes the real page (shown as a hint). */
  slice?: string;
  /** One-liner for the Admin-home card grid. */
  description?: string;
}

export interface AdminNavGroupDef {
  group: AdminNavGroup;
  entries: AdminNavEntry[];
}

export const ADMIN_HOME_URL = "/admin";

/** The vertical-admin composition path on the portal host (arch decision 1). */
export function verticalAdminUrl(vertical: Exclude<AdminOwnerApp, "portal">): string {
  return `/${vertical}/admin`;
}

export const adminNav: AdminNavGroupDef[] = [
  {
    group: "Ecosystem",
    entries: [
      {
        label: "Staged registrations",
        group: "Ecosystem",
        ownerApp: "portal",
        url: "/admin/staged-registrations",
        description: "Review, approve, or reject staged provider registrations.",
      },
      {
        label: "Users",
        group: "Ecosystem",
        ownerApp: "portal",
        url: "/admin/users",
        description: "Ecosystem-wide user accounts and identity.",
      },
      {
        label: "Memberships",
        group: "Ecosystem",
        ownerApp: "portal",
        url: "/admin/memberships",
        description: "Which verticals a user belongs to, and in what capacity.",
      },
      {
        label: "Providers (identity)",
        group: "Ecosystem",
        ownerApp: "portal",
        url: "/admin/providers",
        description: "Account standing and identity proof for providers.",
      },
      {
        // LC-3. Ecosystem-scoped rather than per-vertical on purpose: the whole
        // ruling is that ONE surface controls launch state everywhere, so this
        // must never be split into four entries under the vertical groups below.
        label: "Launch control",
        group: "Ecosystem",
        ownerApp: "portal",
        url: "/admin/launch-control",
        slice: "LC-3",
        description:
          "Which verticals are open to the public. Closed shows SHOWCASE records, open shows REAL.",
      },
      {
        label: "Audit log",
        group: "Ecosystem",
        ownerApp: "portal",
        url: "/admin/audit",
        slice: "Stage C (decision 2)",
        description: "Ecosystem admin audit trail.",
      },
      {
        label: "Platform payments",
        group: "Ecosystem",
        ownerApp: "portal",
        url: "/admin/platform-payments",
        slice: "Stage C (decision 2)",
        description: "Platform-level payment administration.",
      },
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
        pending: true, // carve-out: admin routes not yet re-rooted (register #4)
        slice: "UAS-S3 (after /demia/admin/* re-root)",
        description:
          "Chat reports, packages, submissions, watermark, telegram, tiers, network, automation.",
      },
    ],
  },
  {
    group: "Salon",
    entries: [
      {
        label: "Salon product-admin",
        group: "Salon",
        ownerApp: "salon",
        url: verticalAdminUrl("salon"),
        external: true,
        slice: "UAS-S3 (shared chrome)",
        description: "Salon's own review / verification admin.",
      },
    ],
  },
  {
    group: "Apparel",
    entries: [
      {
        label: "Apparel product-admin",
        group: "Apparel",
        ownerApp: "apparel",
        url: verticalAdminUrl("apparel"),
        external: true,
        slice: "Apoyo Apparel Slice 16 (shared chrome)",
        description: "Seller approval, listing takedown, report intake, registration toggle.",
      },
    ],
  },
  {
    group: "Food",
    entries: [
      {
        label: "Food product-admin",
        group: "Food",
        ownerApp: "food",
        url: verticalAdminUrl("food"),
        external: true,
        slice: "Apoyo Food Slice 16 (shared chrome)",
        description: "Seller approval, listing takedown, report intake, category manager.",
      },
    ],
  },
];

/** Flat list of every entry. */
export const adminNavEntries: AdminNavEntry[] = adminNav.flatMap((g) => g.entries);

/** url→label lookup for breadcrumb labels — Portal-owned routes only. */
export const adminHrefLabels: Record<string, string> = Object.fromEntries(
  adminNavEntries.filter((e) => e.ownerApp === "portal").map((e) => [e.url, e.label])
);

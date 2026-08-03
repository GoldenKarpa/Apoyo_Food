"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { adminNav, ADMIN_HOME_URL } from "@/lib/admin-nav";

// Shared Apoyo admin shell chrome, rendered around Food-owned admin pages so
// they look & navigate identically to a native Portal admin page (UAS-S3,
// nav-contract item 5). Mirrors portal-web's shell (and Salon's/Apparel's own
// mirrors of it, Apparel's being the more recently built one this was copied
// from): persistent sidebar (from the mirrored composition registry), "←
// Admin home", and a breadcrumb trail. Every destination is an absolute
// portal-host path, so all links are full <a> navigations (the sidebar spans
// apps); ecosystem/Demia/Salon/Apparel links leave to their owning app (↗),
// the Food entry is the current app (active).
export function ApoyoAdminShell({
  trail,
  userEmail,
  children,
}: {
  trail: { label: string; href?: string }[];
  userEmail: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const crumbs = [{ label: "Admin home", href: ADMIN_HOME_URL }, ...trail];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a href={ADMIN_HOME_URL} className="admin-brand">
          Apoyo
          <span className="tag">Admin</span>
        </a>

        <a href={ADMIN_HOME_URL} className="admin-home-link">
          <span aria-hidden>←</span> Admin home
        </a>

        <nav aria-label="Admin sections">
          {adminNav.map((group) => (
            <div key={group.group} className="admin-nav-group">
              <div className="admin-nav-group-title">{group.group}</div>
              {group.entries.map((entry) => {
                if (entry.pending) {
                  return (
                    <div
                      key={entry.label}
                      className="admin-nav-disabled"
                      title={entry.slice ? `Composed here in ${entry.slice}` : undefined}
                    >
                      <span>{entry.label}</span>
                      {entry.slice ? <span className="admin-nav-hint">{entry.slice}</span> : null}
                    </div>
                  );
                }
                const active = pathname === entry.url || pathname.startsWith(entry.url + "/");
                return (
                  <a
                    key={entry.url}
                    href={entry.url}
                    className={active ? "admin-nav-link active" : "admin-nav-link"}
                    aria-current={active ? "page" : undefined}
                  >
                    <span>{entry.label}</span>
                    {entry.external && !active ? (
                      <span className="admin-nav-ext" aria-hidden>
                        ↗
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <nav aria-label="Breadcrumb" className="admin-breadcrumbs">
            <ol>
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={i}>
                    {last || !crumb.href ? (
                      <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                    ) : (
                      <a href={crumb.href}>{crumb.label}</a>
                    )}
                    {!last ? (
                      <span className="sep" aria-hidden>
                        /
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="admin-topbar-user">
            <span>{userEmail ? `${userEmail} · ADMIN` : "ADMIN"}</span>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}

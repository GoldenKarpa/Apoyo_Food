import { getFoodSession } from "@/lib/session";
import { requireAdmin } from "@/lib/auth-guards";
import { ApoyoAdminShell } from "@/components/admin/apoyo-admin-shell";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import "./apoyo-admin-shell.css";

// UAS-S3, mirroring Salon's and Apparel's own admin layouts: Food's admin
// pages render the shared Apoyo admin shell chrome so they look & navigate
// identically to a native Portal admin page (nav-contract item 5). The
// shared ADMIN session (legacy `role`) is accepted here —
// `lib/auth-guards.ts`'s `requireAdmin()`, unchanged since Slice 3.
//
// ⚠ This layout controls what is DISPLAYED, not what EXECUTES. Every
// data-loading page under it must still call `adminMayLoadData()` above its
// first query — a page under a denying layout still runs its own queries and
// ships the rows in the RSC payload regardless of what this layout renders
// (the real, live Portal leak `lib/auth-guards.ts`'s own comment documents).
export default async function FoodAdminLayout({ children }: { children: React.ReactNode }) {
  const [session, admin] = await Promise.all([getFoodSession(), requireAdmin()]);

  if (!admin) {
    return <AdminAccessDenied signedIn={!!session} email={session?.email ?? null} />;
  }

  return (
    <ApoyoAdminShell trail={[{ label: "Food product-admin" }]} userEmail={admin.email}>
      {children}
    </ApoyoAdminShell>
  );
}

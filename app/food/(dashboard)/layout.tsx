import { SellerNav } from "@/components/seller/seller-nav";
import { loadSellerWorkspace } from "@/lib/seller";

/**
 * The seller workspace shell: the nav bar, plus the padded `<main>` every
 * dashboard route renders into.
 *
 * The nav appears only once a `FoodSeller` row exists — before that the whole
 * surface is a single "become a seller" page, and a workspace nav above it
 * would advertise five destinations that all say "finish registering first".
 */
export default async function SellerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { seller } = await loadSellerWorkspace();

  return (
    <>
      {seller && <SellerNav />}
      <main className="screen-pad flex flex-1 flex-col gap-6 py-8">{children}</main>
    </>
  );
}

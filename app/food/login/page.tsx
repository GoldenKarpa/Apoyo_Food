import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

// Supplies its own <main> — see the note in app/food/admin/page.tsx.
// ⚠ Also supplies its own height since 2026-08-15: the seller header and its
// `min-h-dvh` flex container moved from `app/food/layout.tsx` down into
// `(dashboard)/layout.tsx` (so they stop wrapping `/food/admin`), and this page
// is a sibling of that group, not a member of it. Without `min-h-dvh` here the
// placeholder would sit in a collapsed box instead of filling the viewport.
// ⚠ Still a placeholder, and deliberately so: Food has no login door of its own
// (Slices 10/11 settled the ecosystem rule that a vertical must never surface
// another vertical's URL as a redirect target). `<SignedOutNotice>` states the
// situation everywhere it matters instead.
export default async function SellerLoginPage() {
  const t = await getTranslations("seller.login");
  return (
    <main className="screen-pad flex min-h-dvh flex-col gap-6 py-8">
      <PlaceholderPage title={t("title")} body={t("body")} />
    </main>
  );
}

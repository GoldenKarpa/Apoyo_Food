import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

// Supplies its own <main> — see the note in app/food/admin/page.tsx.
// ⚠ Still a placeholder, and deliberately so: Food has no login door of its own
// (Slices 10/11 settled the ecosystem rule that a vertical must never surface
// another vertical's URL as a redirect target). `<SignedOutNotice>` states the
// situation everywhere it matters instead.
export default async function SellerLoginPage() {
  const t = await getTranslations("seller.login");
  return (
    <main className="screen-pad flex flex-1 flex-col gap-6 py-8">
      <PlaceholderPage title={t("title")} body={t("body")} />
    </main>
  );
}

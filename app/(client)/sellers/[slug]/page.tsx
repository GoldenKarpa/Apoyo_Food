import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

// The slug is read (and discarded) here only so the route's real signature is
// in place from the start — Next 15 params are async.
export default async function SellerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const [t, { slug }] = await Promise.all([getTranslations("client.sellerProfile"), params]);
  return <PlaceholderPage title={t("title")} body={`${t("body")} (/${slug})`} />;
}

import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function BrowsePage() {
  const t = await getTranslations("client.browse");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}

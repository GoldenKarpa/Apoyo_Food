import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function SearchPage() {
  const t = await getTranslations("client.search");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}

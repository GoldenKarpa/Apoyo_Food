import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function SavedPage() {
  const t = await getTranslations("client.saved");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}

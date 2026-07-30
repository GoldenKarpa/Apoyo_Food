import { getTranslations } from "next-intl/server";

// Client marketplace shell — food.apoyolime.com. Deliberately minimal: Slice 7
// builds the real chrome (bottom tab bar, ES/EN toggle pill top-right, section
// headers) on top of the Sobremesa component library. This is enough structure
// for the Slice 1 placeholders to sit in something token-styled.
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("brand");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-hairline bg-card">
        <div className="screen-pad flex min-h-[64px] items-center">
          <span className="font-display text-h1 font-semibold text-green">{t("name")}</span>
        </div>
      </header>
      <main className="screen-pad flex flex-1 flex-col gap-6 py-8">{children}</main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { ComingSoon } from "@/components/coming-soon";
import { AccountAvatarIcon, AccountModal } from "@/components/chrome/account-modal";
import { NAV_ITEMS } from "@/components/chrome/nav-config";
import type { AccountSummary } from "@/lib/account-summary";
import { LocaleToggle } from "@/components/locale-toggle";
import { cn } from "@/lib/utils";

/**
 * Buyer-surface header (Emergent `food (10)`): the serif wordmark on the left,
 * the ES/EN pill on the right, and — from 768px — the same five destinations
 * `<BottomNav>` shows on a phone, read from the same `nav-config.ts`.
 *
 * ── The wordmark is a control, not decoration ──
 * It is the Home destination, so it is sized as a real ≥44px tap target. Apparel
 * shipped its own as a bare 24px-tall inline `<a>` and only caught it by
 * measuring the rendered DOM. The desktop row therefore omits Home — the
 * wordmark already is it.
 *
 * "Apoyo" green + "Food" ink follows the mockups' two-tone lockup. Both halves
 * are measured against the `card` surface (5.44:1 and 12.73:1); the wordmark is
 * a single `<span>` pair inside one link so it is announced as one name.
 *
 * ⚠ Part F3: the locale pill is **top-right, always visible, on every surface** —
 * "bilingual as brand, not a hidden setting". It is never conditional on width.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ accountSummary }: { accountSummary: AccountSummary | null }) {
  const pathname = usePathname();
  const [t, tb] = [useTranslations("nav"), useTranslations("brand")];

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-card">
      <div className="screen-pad flex min-h-[64px] items-center justify-between gap-3">
        <Link
          href="/"
          className="tap-target -ml-2 flex items-center rounded-pill px-2 font-display text-h1 font-semibold transition-colors duration-200 ease-soft hover:bg-green-soft"
        >
          <span className="text-green">{tb("nameFirst")}</span>
          <span className="ml-1.5 text-ink">{tb("nameSecond")}</span>
        </Link>

        <nav aria-label={t("primary")} className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.filter((item) => item.key !== "home").map((item) => {
            const label = t(`items.${item.key}`);
            const active = item.href ? isActive(pathname, item.href) : false;
            const linkClass = cn(
              "tap-target flex items-center gap-2 rounded-pill px-4 text-label font-medium transition-colors duration-200 ease-soft",
              active ? "bg-green-soft text-green" : "text-ink hover:bg-sunken",
            );
            const Icon = item.icon;

            // Same session-dependent special case as <BottomNav> — everything
            // else, including "account" when signed out, is unchanged.
            if (item.key === "account" && accountSummary) {
              return (
                <AccountModal key={item.key} summary={accountSummary}>
                  <button type="button" className={linkClass} data-account-avatar="">
                    <AccountAvatarIcon summary={accountSummary} className="h-4 w-4" />
                    {label}
                  </button>
                </AccountModal>
              );
            }

            return item.href ? (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={linkClass}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </Link>
            ) : (
              <ComingSoon key={item.key} feature={item.feature!} asChild>
                <button type="button" className={linkClass} data-coming-soon={item.feature}>
                  <Icon aria-hidden className="h-4 w-4" />
                  {label}
                </button>
              </ComingSoon>
            );
          })}
        </nav>

        <LocaleToggle />
      </div>
    </header>
  );
}

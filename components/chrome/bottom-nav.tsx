"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { ComingSoon } from "@/components/coming-soon";
import { AccountAvatarIcon, AccountModal, SignedOutAccountModal } from "@/components/chrome/account-modal";
import { NAV_ITEMS, type NavItem } from "@/components/chrome/nav-config";
import type { AccountSummary } from "@/lib/account-summary";
import { cn } from "@/lib/utils";

/**
 * The bottom tab bar (architecture Part F3: "Home · Browse · Orders · Saved ·
 * Account, active = green"), mobile only.
 *
 * **Mobile only, deliberately.** A bar pinned to the bottom edge of a 1280px
 * display is a phone pattern on the wrong screen; from 768px `<SiteHeader>`
 * carries the same five destinations from the same config.
 *
 * Details that matter and are easy to lose later:
 *  - Each tab is a full ≥44px target in *both* directions, sized explicitly
 *    rather than by padding. Apparel measured its own locale pill and found one
 *    segment at 43.6px while its twin passed — padding alone is not a guarantee.
 *  - `pb-[env(safe-area-inset-bottom)]` keeps the tabs above the iOS home
 *    indicator; without it the last row of tappable pixels is unreachable on
 *    exactly the devices this product is designed for.
 *  - The active state is `green` per Part F3's anchor rule — never the category
 *    accent, so wayfinding cannot be destabilised by seasonal theming.
 *  - `aria-current="page"` carries the active state to assistive tech; colour
 *    alone would not.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabInner({
  item,
  label,
  active,
  icon,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  /** Overrides `item.icon` — the signed-in account avatar's own escape hatch. */
  icon?: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <>
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-pill transition-colors duration-200 ease-soft",
          active && "bg-green-soft",
        )}
      >
        {icon ?? <Icon aria-hidden className="h-5 w-5" />}
      </span>
      <span className="text-caption font-medium">{label}</span>
    </>
  );
}

export function BottomNav({ accountSummary }: { accountSummary: AccountSummary | null }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("primary")}
      className="sticky bottom-0 z-40 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const label = t(`items.${item.key}`);
          const active = item.href ? isActive(pathname, item.href) : false;
          const tabClass = cn(
            "flex min-h-[56px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5",
            // Full `ink` for the inactive label rather than `ink-muted`: this
            // bar sits on `card`, where ink-muted would pass, but the same
            // component renders over `sunken` backdrops during scroll-over and
            // the Slice 1 rule is to not depend on that (4.37:1 there).
            active ? "text-green" : "text-ink",
          );

          // The account item is the ONE nav item whose rendering depends on
          // session state — everything else is exactly the same static
          // ComingSoon/Link branch this file has always had. Signed in: the
          // avatar + identity sheet (Slice 21). Signed out: a sheet with real
          // sign-in/register doors (Slice 23) — which still carries the old
          // stub's Phase-4 note, but is no longer a dead end.
          if (item.key === "account") {
            return (
              <li key={item.key} className="flex flex-1">
                {accountSummary ? (
                  <AccountModal summary={accountSummary}>
                    <button type="button" className={tabClass} data-account-avatar="">
                      <TabInner
                        item={item}
                        label={label}
                        active={false}
                        icon={<AccountAvatarIcon summary={accountSummary} className="h-5 w-5" />}
                      />
                    </button>
                  </AccountModal>
                ) : (
                  <SignedOutAccountModal>
                    <button type="button" className={tabClass} data-account-signed-out="">
                      <TabInner item={item} label={label} active={false} />
                    </button>
                  </SignedOutAccountModal>
                )}
              </li>
            );
          }

          return (
            <li key={item.key} className="flex flex-1">
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={tabClass}
                >
                  <TabInner item={item} label={label} active={active} />
                </Link>
              ) : (
                <ComingSoon feature={item.feature!} asChild>
                  <button type="button" className={tabClass} data-coming-soon={item.feature}>
                    <TabInner item={item} label={label} active={false} />
                  </button>
                </ComingSoon>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

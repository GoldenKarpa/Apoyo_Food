import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * What the seller surface shows to someone with no session.
 *
 * ⚠ **States the situation and stops — no redirect, no guessed cross-vertical
 * link.** The ecosystem rule the user set during Apparel's build is that one
 * vertical must never surface a DIFFERENT vertical's URL or brand to its
 * visitor as a redirect target. That rule was never about Food having its own
 * login door — it was about never guessing at Salon's, the Apoyo-Demia app's,
 * or Apparel's. Slices 10 and 11 answered the same question the same way for
 * Save and Follow (an inline hint, never a cross-vertical guess).
 *
 * ⚠ `namespace` was added at Slice 17 for `/orders`/`/orders/[id]` — the FIRST
 * caller on the CLIENT surface, which needs its own `client.signedOut` copy
 * (the client surface defaults `en`; the seller copy defaults `es`, and the
 * two read different message trees for that reason alone).
 *
 * `loginHref` (Slice 19½ — the real login/register pair this ecosystem rule
 * was always waiting on, found missing live) turns the notice into a real
 * control ONLY where the destination is same-origin and known: the two
 * `client.signedOut` callers pass `/login` (same origin as `food.
 * apoyolime.com` itself). Every seller-surface caller passes nothing and
 * keeps the exact prior behavior — `/food/login` is still deliberately a
 * stub (see its own file comment), and a cross-origin link from
 * `portal.apoyolime.com/food/*` to `food.apoyolime.com/login` would need its
 * own `lib/links.ts`-style absolute-URL builder, real but separable work,
 * not built here.
 *
 * `registerHref` (Slice 23) is the PROVIDER door, and it exists because the
 * two audiences hitting a signed-out seller page are genuinely different
 * people: someone who already sells here and merely lost their session needs
 * `loginHref`; someone who just clicked "Sell your food" for the first time
 * needs to REGISTER, and per the ecosystem's own established convention that
 * happens at portal, not here (see `lib/links.ts`'s `portalPageUrl` for why
 * that is not a cross-vertical-guess violation, and for the Salon precedent it
 * follows). Salon's own equivalent page hard-`redirect()`s signed-out visitors
 * straight to portal; this notice deliberately offers BOTH doors instead,
 * because a blind redirect to a registration form is actively wrong for the
 * returning-seller half of that audience — Salon's page is only ever reached
 * as an explicit "apply" action, whereas this one is also where an expired
 * session lands.
 */
export async function SignedOutNotice({
  namespace = "seller.signedOut",
  loginHref,
  registerHref,
}: { namespace?: string; loginHref?: string; registerHref?: string } = {}) {
  const t = await getTranslations(namespace);

  return (
    <section className="rounded-card border border-hairline bg-card p-6">
      <h1 className="font-display text-h1 font-semibold text-ink">{t("title")}</h1>
      <p className="mt-3 max-w-prose text-body text-ink">{t("body")}</p>
      {(loginHref || registerHref) && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {loginHref && (
            <Link
              href={loginHref}
              className="font-medium text-green underline-offset-4 hover:underline"
            >
              {t("signIn")}
            </Link>
          )}
          {/* A plain <a>, not next/link: this leaves the app entirely for
              another origin, and prefetching/client-navigating a cross-origin
              URL is meaningless at best. */}
          {registerHref && (
            <a
              href={registerHref}
              className="font-medium text-green underline-offset-4 hover:underline"
            >
              {t("register")}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

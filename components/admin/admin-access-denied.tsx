import { getTranslations } from "next-intl/server";

/**
 * Rendered by `app/food/admin/layout.tsx` when the shared session isn't
 * ADMIN. Mirrors portal-web's own `AccessDenied` (its `/admin` layout shows
 * this rather than redirecting) and Apparel's own copy — Food has no login
 * page of its own to redirect to (`app/food/login` is still a placeholder;
 * Slices 10/11 settled that a vertical must never surface another vertical's
 * URL as a redirect target from its OWN buyer/seller surfaces). This
 * component only ever renders composed at `portal.apoyolime.com/food/admin`
 * though (the vertical-admin URL convention), so a RELATIVE `/login` link
 * here resolves to portal-web's real sign-in on that same origin — not to
 * Food's own stub, and not a cross-vertical redirect in the sense that rule
 * was written to prevent. Never a dead-end (nav-contract item 4): a
 * signed-out visitor gets a sign-in link; a signed-in non-admin gets a way
 * back to their own workspace.
 */
export async function AdminAccessDenied({
  signedIn,
  email,
}: {
  signedIn: boolean;
  email: string | null;
}) {
  const t = await getTranslations("seller.admin.accessDenied");

  return (
    <div className="admin-shell">
      <div className="admin-main">
        <main className="admin-content" style={{ maxWidth: "28rem", margin: "4rem auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>{t("title")}</h1>
          {signedIn ? (
            <>
              <p style={{ color: "var(--aa-text-muted, #5b6673)", marginBottom: "1rem" }}>
                {email ? t("signedInAs", { email }) : t("signedInGeneric")}
              </p>
              <a className="btn btn-ghost" href="/food">
                {t("returnToWorkspace")}
              </a>
            </>
          ) : (
            <>
              <p style={{ color: "var(--aa-text-muted, #5b6673)", marginBottom: "1rem" }}>{t("signInPrompt")}</p>
              <a className="btn" href="/login?callbackUrl=/food/admin">
                {t("signIn")}
              </a>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

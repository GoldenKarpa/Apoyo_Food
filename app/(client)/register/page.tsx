import { redirect } from "next/navigation";

import { ProviderDoorHint } from "@/components/auth/provider-door-hint";
import { RegisterForm } from "@/components/auth/register-form";
import { getFoodSession } from "@/lib/session";

/**
 * The client surface's real registration door — same story as `/login`
 * (Slice 1 placeholder, never replaced until found live during Slice 19's
 * own production smoke test).
 *
 * `<ProviderDoorHint>` is the cross-vertical provider cross-link (2026-08-10
 * ask): a would-be cook who landed on the BUYER form gets an in-context way
 * out. It stays a sibling of the form rather than living inside it, because it
 * is gated server-side on the ecosystem registration toggle and
 * `<RegisterForm>` is a client component — see that file's own header.
 */
export default async function RegisterPage() {
  const session = await getFoodSession();
  if (session) redirect("/");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <RegisterForm />
      <ProviderDoorHint />
    </div>
  );
}

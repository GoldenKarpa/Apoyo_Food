import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getFoodSession } from "@/lib/session";

/**
 * The client surface's real sign-in door — replaces the Slice 1 placeholder
 * (found still live during Slice 19's own production smoke test; no slice
 * through 19 had ever come back to build it). `<SignedOutNotice>` and every
 * other "sign in" prompt in this app can now link here for real.
 */
export default async function LoginPage() {
  const session = await getFoodSession();
  if (session) redirect("/");

  return (
    <div className="flex flex-1 items-center justify-center">
      <LoginForm />
    </div>
  );
}

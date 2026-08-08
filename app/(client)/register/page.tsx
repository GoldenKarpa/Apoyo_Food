import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { getFoodSession } from "@/lib/session";

/**
 * The client surface's real registration door — same story as `/login`
 * (Slice 1 placeholder, never replaced until found live during Slice 19's
 * own production smoke test).
 */
export default async function RegisterPage() {
  const session = await getFoodSession();
  if (session) redirect("/");

  return (
    <div className="flex flex-1 items-center justify-center">
      <RegisterForm />
    </div>
  );
}

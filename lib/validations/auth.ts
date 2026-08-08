import { z } from "zod";

/**
 * Client-side form schemas for the real login/register forms (formerly Slice
 * 1 placeholders — see `components/auth/{login,register}-form.tsx`). Field
 * shape mirrors portal-web's own `registerSchema`/`credentialsSchema`
 * (`Apoyo-Portal/portal-web/lib/validations/auth.ts`) closely enough that a
 * client-side pass and the server's own pass reject the same inputs, but
 * error MESSAGES are message keys, not hardcoded English strings — every
 * other form in this app is fully bilingual and these are no exception.
 */
export const loginFormSchema = z.object({
  email: z.string().email("invalidEmail"),
  password: z.string().min(1, "passwordRequired"),
});

export const registerFormSchema = z.object({
  displayName: z.string().min(2, "displayNameTooShort").max(80, "displayNameTooLong"),
  email: z.string().email("invalidEmail"),
  password: z.string().min(8, "passwordTooShort").max(128, "passwordTooLong"),
});

export type LoginFormInput = z.infer<typeof loginFormSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;

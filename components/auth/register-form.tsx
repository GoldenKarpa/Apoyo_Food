"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { registerFormSchema, type RegisterFormInput } from "@/lib/validations/auth";
import { registerPortal } from "@/lib/portal-auth";

/**
 * The client surface's real registration form — same story as `<LoginForm>`:
 * Slice 1 scaffolded this page as a placeholder and no later slice ever
 * replaced it. Posts to portal-web identity-only (decision 15 — no
 * role/vertical field, ever); the resulting account is a plain CLIENT with
 * `originSubdomain: "food"` once portal-web recognizes `food` as a
 * registration surface (see the portal-web-side fix landing alongside this).
 */
export function RegisterForm() {
  const t = useTranslations("client.register");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormInput>({ resolver: zodResolver(registerFormSchema) });

  const onSubmit = async (data: RegisterFormInput) => {
    if (!turnstileToken && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      setServerError(t("captchaRequired"));
      return;
    }
    setIsLoading(true);
    setServerError(null);

    const result = await registerPortal({ ...data, turnstileToken: turnstileToken ?? "" });

    setIsLoading(false);

    if (!result.ok) {
      setServerError(result.error === "network_error" ? t("networkError") : t("genericError"));
      setTurnstileToken(null);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("checkEmailTitle")}</CardTitle>
          <CardDescription>{t("checkEmailBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-label text-ink-muted">
            {t("alreadyHaveAccount")}{" "}
            <Link href="/login" className="font-medium text-green underline-offset-4 hover:underline">
              {t("signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {serverError && (
          <div className="rounded-control border border-error bg-terracotta-soft px-4 py-3 text-label text-error">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">{t("displayName")}</Label>
            <Input id="displayName" autoComplete="name" {...register("displayName")} />
            {errors.displayName && (
              <p className="text-caption text-error">
                {t(errors.displayName.message as "displayNameTooShort")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-caption text-error">{t(errors.email.message as "invalidEmail")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("minPassword")}
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-caption text-error">{t(errors.password.message as "passwordTooShort")}</p>
            )}
          </div>

          <TurnstileWidget
            onToken={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
          />

          <Button type="submit" disabled={isLoading}>
            {isLoading ? t("submitting") : t("submit")}
          </Button>
        </form>

        <p className="text-center text-label text-ink-muted">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-green underline-offset-4 hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { loginFormSchema, type LoginFormInput } from "@/lib/validations/auth";
import { loginPortalCredentials } from "@/lib/portal-auth";

/**
 * The client surface's real sign-in form (Slice 1 scaffolded this page as a
 * placeholder; no slice through 19 ever came back to build it — found live
 * while testing the order-lifecycle loop). Submits to portal-web invisibly
 * (`lib/portal-auth.ts`); this app's own session reading (`lib/session.ts`)
 * already existed and needed no change — only the form itself was missing.
 */
export function LoginForm() {
  const t = useTranslations("client.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("callbackUrl") ?? "";
  const callbackPath = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormInput>({ resolver: zodResolver(loginFormSchema) });

  const onSubmit = async (data: LoginFormInput) => {
    if (!turnstileToken && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      setServerError(t("captchaRequired"));
      return;
    }
    setIsLoading(true);
    setServerError(null);

    const result = await loginPortalCredentials({
      email: data.email,
      password: data.password,
      turnstileToken: turnstileToken ?? "",
      callbackUrl: `${window.location.origin}${callbackPath}`,
    });

    setIsLoading(false);

    if (!result.ok) {
      setServerError(result.error === "network_error" ? t("networkError") : t("invalidCredentials"));
      setTurnstileToken(null);
      return;
    }

    router.push(callbackPath);
    router.refresh();
  };

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
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-caption text-error">{t(errors.email.message as "invalidEmail")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
            {errors.password && (
              <p className="text-caption text-error">{t(errors.password.message as "passwordRequired")}</p>
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
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-green underline-offset-4 hover:underline">
            {t("signUp")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

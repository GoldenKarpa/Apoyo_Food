"use client";

import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      reset: (id: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * Port of Apoyo-Salon's and the Apoyo-Demia app's own widget (same
 * component, same behavior everywhere it's shipped): skips rendering
 * entirely when no site key is configured — a signed-out visitor sees a
 * plain form, never a broken CAPTCHA box.
 */
export function TurnstileWidget({ onToken, onExpire, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  const render = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => {
        widgetIdRef.current = null;
        onExpire?.();
      },
      "error-callback": () => {
        widgetIdRef.current = null;
        onError?.();
      },
    });
  }, [siteKey, onToken, onExpire, onError]);

  useEffect(() => {
    if (!siteKey) return;

    if (window.turnstile) {
      render();
      return;
    }

    window.onTurnstileLoad = render;
    if (!document.getElementById("cf-turnstile-script")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [render, siteKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} className="mt-1" />;
}

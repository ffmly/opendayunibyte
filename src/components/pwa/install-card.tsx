"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X, Smartphone } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPwaCard() {
  const { locale } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIos] = useState(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
  });
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!window.sessionStorage.getItem("unibyte_pwa_dismissed");
    } catch {
      return false;
    }
  });
  const [installed, setInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isStandalone || dismissed || installed) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide((prev) => !prev);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem("unibyte_pwa_dismissed", "1");
    } catch {}
  };

  const isAr = locale === "ar";

  return (
    <Card className="relative overflow-hidden border border-primary/20 bg-gradient-to-r from-primary/10 via-white to-primary/5 p-4 shadow-md transition-all">
      <button
        onClick={handleDismiss}
        aria-label="Close"
        className="absolute top-2.5 end-2.5 p-1 text-ink-soft hover:text-ink transition-colors rounded-full"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pe-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-primary-deep">
            {isAr ? "ثبّت التطبيق على هاتفك" : "Install UniByte App"}
          </h3>
          <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">
            {isAr
              ? "وصول أسرع للأنشطة والمسابقة بدون إعادة تسجيل الدخول!"
              : "Instant access, faster scanning & saves your session!"}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleInstallClick}
              className="gap-1.5 h-8 text-xs font-bold px-3 shadow-sm"
            >
              {deferredPrompt ? (
                <>
                  <Download className="h-3.5 w-3.5" />
                  {isAr ? "تثبيت الآن" : "Install Now"}
                </>
              ) : isIos ? (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  {isAr ? "كيفية التثبيت (آيفون)" : "How to install (iOS)"}
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  {isAr ? "إضافة للشاشة الرئيسية" : "Add to Home Screen"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {showIosGuide && (
        <div className="mt-3 rounded-xl border border-primary/15 bg-white/95 p-3 text-xs leading-relaxed text-ink space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="font-bold text-primary flex items-center gap-1.5">
            <Share2 className="h-4 w-4" />
            {isAr ? "خطوات بسيطة على متصفح Safari:" : "Quick steps for Safari on iPhone:"}
          </p>
          <ol className="list-decimal list-inside space-y-1 text-ink-soft font-medium">
            <li>
              {isAr ? (
                <>اضغط على أيقونة <strong>المشاركة (Share ⎋)</strong> في أسفل المتصفح.</>
              ) : (
                <>Tap the <strong>Share button (⎋)</strong> at the bottom of Safari.</>
              )}
            </li>
            <li>
              {isAr ? (
                <>مرر للأسفل واختر <strong>«إضافة إلى الصفحة الرئيسية» ⊕</strong>.</>
              ) : (
                <>Scroll down and tap <strong>Add to Home Screen (+)</strong>.</>
              )}
            </li>
            <li>
              {isAr ? (
                <>اضغط على <strong>«إضافة» (Add)</strong> في الزاوية العلوية.</>
              ) : (
                <>Tap <strong>Add</strong> in the top-right corner.</>
              )}
            </li>
          </ol>
        </div>
      )}
    </Card>
  );
}

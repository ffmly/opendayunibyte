"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "./i18n-provider";
import { AuthProvider } from "./auth-provider";
import { ServiceWorkerRegister } from "./service-worker-register";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        {children}
        <ServiceWorkerRegister />
      </AuthProvider>
    </I18nProvider>
  );
}

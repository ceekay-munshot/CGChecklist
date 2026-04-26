"use client";

import type { ReactNode } from "react";

import { CompanyHeader } from "@/components/header/CompanyHeader";
import { TabNav } from "@/components/tabs/TabNav";
import { CompanyProvider } from "@/lib/state/CompanyContext";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <CompanyProvider>
      <div className="min-h-screen bg-[var(--color-canvas)]">
        <CompanyHeader />
        <TabNav />
        <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
        <footer className="mx-auto max-w-[1400px] px-6 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
          Governance &amp; Forensic Scorecard · Buy-side internal tool · Data
          fetched server-side via Firecrawl in future builds.
        </footer>
      </div>
    </CompanyProvider>
  );
}

"use client";

import { CompanyHeader } from "@/components/header/CompanyHeader";
import { TabNav } from "@/components/tabs/TabNav";
import { Toaster } from "@/components/ui/Toaster";
import { RefreshProgressModal } from "@/components/refresh/RefreshProgressModal";
import { RefreshSuccessBanner } from "@/components/refresh/RefreshSuccessBanner";
import { RefreshNotifier } from "@/components/refresh/RefreshNotifier";
import { SelectionPanel } from "@/components/refresh/SelectionPanel";
import { CompanyProvider, useCompany } from "@/lib/state/CompanyContext";
import { ToastProvider } from "@/lib/state/ToastContext";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CompanyProvider>
        <RefreshNotifier />
        <ShellBody>{children}</ShellBody>
        <Toaster />
      </CompanyProvider>
    </ToastProvider>
  );
}

function ShellBody({ children }: { children: React.ReactNode }) {
  const { dashboardUnlocked } = useCompany();

  if (!dashboardUnlocked) {
    return <SelectionPanel />;
  }

  return (
    <>
      <div className="flex min-h-screen flex-col">
        <CompanyHeader />
        <TabNav />
        <RefreshSuccessBanner />
        <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] py-4">
          <div className="mx-auto max-w-screen-2xl px-6 text-xs text-[var(--color-fg-subtle)]">
            <span>Governance &amp; Forensic Scorecard</span>
          </div>
        </footer>
      </div>
      <RefreshProgressModal />
    </>
  );
}

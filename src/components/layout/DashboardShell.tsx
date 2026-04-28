import { CompanyHeader } from "@/components/header/CompanyHeader";
import { TabNav } from "@/components/tabs/TabNav";
import { CompanyProvider } from "@/lib/state/CompanyContext";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <div className="flex min-h-screen flex-col">
        <CompanyHeader />
        <TabNav />
        <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] py-4">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 text-xs text-[var(--color-fg-subtle)]">
            <span>Governance &amp; Forensic Scorecard</span>
            <span>Calculations and adapters arrive in upcoming steps.</span>
          </div>
        </footer>
      </div>
    </CompanyProvider>
  );
}

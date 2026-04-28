"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/governance", label: "Corporate Governance Score", short: "Governance" },
  { href: "/beneish", label: "Beneish M-Score", short: "Beneish" },
  { href: "/altman", label: "Altman Z-Score", short: "Altman" },
] as const;

export function TabNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard tabs"
      className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]"
    >
      <div className="mx-auto max-w-screen-2xl px-2 sm:px-6">
        <ul className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={`focus-ring relative inline-flex h-12 items-center px-3 text-sm font-medium transition-colors sm:px-4 ${
                    active
                      ? "text-[var(--color-fg)]"
                      : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="sm:hidden">{tab.short}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span
                    aria-hidden
                    className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors ${
                      active ? "bg-[var(--color-accent)]" : "bg-transparent"
                    }`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

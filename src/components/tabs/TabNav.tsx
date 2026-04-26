"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabDefinition = {
  href: string;
  label: string;
  description: string;
};

const TABS: TabDefinition[] = [
  {
    href: "/governance",
    label: "Corporate Governance",
    description: "Checklist score across board, audit, disclosures",
  },
  {
    href: "/beneish",
    label: "Beneish M-Score",
    description: "Earnings manipulation likelihood",
  },
  {
    href: "/altman",
    label: "Altman Z-Score",
    description: "Financial distress probability",
  },
];

export function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-6">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname?.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              className={
                "group relative flex flex-col gap-0.5 px-4 py-3 text-sm transition " +
                (isActive
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]")
              }
            >
              <span
                className={
                  "font-medium tracking-tight " +
                  (isActive ? "" : "group-hover:text-[var(--color-text-primary)]")
                }
              >
                {tab.label}
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                {tab.description}
              </span>
              <span
                aria-hidden
                className={
                  "absolute inset-x-2 bottom-0 h-[2px] rounded-t-sm " +
                  (isActive
                    ? "bg-[var(--color-teal-500)]"
                    : "bg-transparent")
                }
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import { forwardRef } from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section" | "article";
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { as: Tag = "section", padded = true, className = "", children, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_1px_2px_rgba(10,20,34,0.04)] ${
        padded ? "p-5 sm:p-6" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export function CardHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-[var(--color-fg)]">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={
        "rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] " +
        className
      }
      {...rest}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
};

export function CardHeader({ title, subtitle, trailing }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={"px-5 py-5 " + className}>{children}</div>;
}

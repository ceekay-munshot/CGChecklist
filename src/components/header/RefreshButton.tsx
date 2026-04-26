"use client";

type RefreshButtonProps = {
  onRefresh: () => void;
  isRefreshing: boolean;
  disabled?: boolean;
};

export function RefreshButton({
  onRefresh,
  isRefreshing,
  disabled,
}: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={disabled || isRefreshing}
      className={
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition " +
        "bg-[var(--color-teal-600)] text-white hover:bg-[var(--color-teal-700)] " +
        "disabled:cursor-not-allowed disabled:bg-[var(--color-blue-muted-300)] disabled:text-white/80"
      }
    >
      <span
        aria-hidden
        className={
          "inline-block h-3.5 w-3.5 rounded-full border-2 border-white/70 border-t-transparent " +
          (isRefreshing ? "animate-spin" : "border-t-white/70")
        }
      />
      {isRefreshing ? "Refreshing…" : "Refresh Data"}
    </button>
  );
}

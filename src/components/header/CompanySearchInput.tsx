"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CompanySuggestion } from "@/lib/types/search";

interface CompanySearchInputProps {
  value: string;
  onPick: (suggestion: CompanySuggestion) => void;
  onTextChange: (value: string) => void;
  placeholder?: string;
}

export function CompanySearchInput({
  value,
  onPick,
  onTextChange,
  placeholder,
}: CompanySearchInputProps) {
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listboxId = useId();

  useEffect(() => {
    const query = value.trim();

    const handle = setTimeout(async () => {
      if (query.length < 2) {
        abortRef.current?.abort();
        setSuggestions([]);
        setLoading(false);
        setSearched(false);
        setActiveIndex(-1);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { suggestions: CompanySuggestion[] };
        setSuggestions(data.suggestions || []);
        setActiveIndex(-1);
        setSearched(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSuggestions([]);
          setSearched(true);
        }
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(handle);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (s: CompanySuggestion) => {
    onPick(s);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList =
    open && value.trim().length >= 2 && (loading || searched);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className="focus-ring h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white shadow-[0_12px_32px_rgba(10,20,34,0.08)]"
        >
          {loading && suggestions.length === 0 && (
            <li className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--color-fg-subtle)]">
              <Spinner />
              Searching…
            </li>
          )}
          {!loading && searched && suggestions.length === 0 && (
            <li className="px-4 py-3 text-xs text-[var(--color-fg-subtle)]">
              No matches found.
            </li>
          )}
          {suggestions.map((s, idx) => (
            <li
              key={s.symbol}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex cursor-pointer items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5 transition-colors last:border-b-0 ${
                idx === activeIndex
                  ? "bg-[var(--color-navy-50)]"
                  : "hover:bg-[var(--color-navy-50)]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium leading-snug text-[var(--color-fg)]">
                  {s.name}
                </p>
                {s.industry ? (
                  <p className="mt-0.5 truncate text-[11px] leading-snug text-[var(--color-fg-subtle)]">
                    {s.industry}
                  </p>
                ) : null}
              </div>
              <span
                className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-fg-muted)]"
                data-numeric
              >
                {s.ticker}
                <span className="mx-1 text-[var(--color-fg-subtle)]">·</span>
                {s.exchange}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 animate-spin text-[var(--color-fg-subtle)]"
      fill="none"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

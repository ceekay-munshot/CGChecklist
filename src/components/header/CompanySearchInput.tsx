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
        setActiveIndex(-1);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { suggestions: CompanySuggestion[] };
        setSuggestions(data.suggestions || []);
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
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

  const showList = open && (loading || suggestions.length > 0);

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
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white shadow-lg"
        >
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--color-fg-subtle)]">
              Searching…
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
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                idx === activeIndex
                  ? "bg-[var(--color-navy-50)]"
                  : "hover:bg-[var(--color-navy-50)]"
              }`}
            >
              <span className="truncate text-[var(--color-fg)]">{s.name}</span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                {s.ticker} · {s.exchange}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

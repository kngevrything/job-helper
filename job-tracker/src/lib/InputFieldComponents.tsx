"use client";

import { useMemo, useState } from "react";

type ClearableInputProps = {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
};

export function ClearableInput({
  name,
  value,
  onChange,
  placeholder,
  required,
}: ClearableInputProps) {
  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-9 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          aria-label={`Clear ${name ?? "input"}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

type TypeaheadInputProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
};

export function TypeaheadInput({
  name,
  value,
  onChange,
  suggestions,
  placeholder,
  required,
}: TypeaheadInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const filteredSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();

    if (!query) return [];

    return suggestions
      .filter((item) => item.toLowerCase().includes(query))
      .filter((item) => item !== value)
      .slice(0, 8);
  }, [suggestions, value]);

  const showSuggestions = isFocused && filteredSuggestions.length > 0;

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 100)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-9 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          aria-label={`Clear ${name}`}
        >
          ×
        </button>
      )}

      {showSuggestions && (
        <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-300 bg-white shadow-lg">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(suggestion)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
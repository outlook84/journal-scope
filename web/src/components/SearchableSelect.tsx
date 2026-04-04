import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

import { useI18n } from '../i18n-context';
import type { SelectOption } from '../types/app';

function normalizeOption(option: string | SelectOption): SelectOption {
  if (typeof option === 'string') {
    return { value: option, label: option };
  }
  return option;
}

export const SearchableSelect = memo(function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  onOpen
}: {
  value: string;
  options: Array<string | SelectOption>;
  onChange: (value: string) => void;
  placeholder: string;
  onOpen?: () => void;
}) {
  const { messages } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedOptions = options.map(normalizeOption);
  const selectedOption = normalizedOptions.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedOptions.filter((option) => {
    if (!normalizedQuery) return true;
    const haystack = `${option.label}\n${option.value}\n${option.searchText ?? ''}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen) onOpen?.();
        }}
        className="w-full cursor-pointer flex justify-between items-center bg-surface-container-lowest text-on-surface text-sm font-medium border border-outline-variant/45 rounded-md px-3 py-2 hover:bg-surface-container-low transition-colors"
        title={value === 'all' ? placeholder : selectedOption?.label ?? value}
      >
        <span className="truncate text-on-surface-variant font-medium">{value === 'all' ? placeholder : selectedOption?.label ?? value}</span>
        <ChevronDown size={14} className={`text-on-surface-variant/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-surface-container-high border border-outline-variant/40 rounded-md shadow-[0_18px_40px_rgba(40,60,140,0.15)] overflow-hidden flex flex-col max-h-64">
          <div className="p-2 border-b border-outline-variant/30 shrink-0 bg-surface-container">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size={12} />
              <input
                autoFocus
                type="text"
                placeholder={messages.searchItems}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full bg-background border border-outline-variant/45 rounded pl-7 pr-2 py-1.5 text-sm text-on-surface outline-none focus:border-primary/55 placeholder:text-on-surface-variant/40"
              />
            </div>
          </div>
          <div className="overflow-y-auto overflow-x-hidden flex-1 log-scrollbar py-1">
            <div
              onClick={() => {
                onChange('all');
                setIsOpen(false);
                setQuery('');
              }}
              className={`px-3 py-2 text-sm font-medium tracking-wide cursor-pointer hover:bg-primary/10 transition-colors truncate ${value === 'all' ? 'text-primary' : 'text-on-surface-variant/80'}`}
            >
              {placeholder}
            </div>
            {filtered.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setQuery('');
                }}
                title={option.label}
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-primary/10 transition-colors truncate ${value === option.value ? 'text-primary font-bold' : 'text-on-surface hover:text-primary-light'}`}
              >
                {option.label}
              </div>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-center text-on-surface-variant/50">{messages.noMatchesFound}</div>}
          </div>
        </div>
      )}
    </div>
  );
});

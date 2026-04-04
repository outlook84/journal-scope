import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { useI18n } from '../i18n-context';

export function PriorityMultiSelect({
  values,
  onChange
}: {
  values: string[];
  onChange: (nextValues: string[]) => void;
}) {
  const { messages } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const priorityOptions = [
    { value: '0', label: messages.priorityLabel('0') },
    { value: '1', label: messages.priorityLabel('1') },
    { value: '2', label: messages.priorityLabel('2') },
    { value: '3', label: messages.priorityLabel('3') },
    { value: '4', label: messages.priorityLabel('4') },
    { value: '5', label: messages.priorityLabel('5') },
    { value: '6', label: messages.priorityLabel('6') },
    { value: '7', label: messages.priorityLabel('7') }
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableOptions = priorityOptions.filter((option) => !values.includes(option.value));

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        onClick={() => setIsOpen((open) => !open)}
        className="w-full cursor-pointer flex justify-between items-center bg-surface-container-lowest text-on-surface text-sm font-medium border border-outline-variant/45 rounded-md px-3 py-2 hover:bg-surface-container-low transition-colors"
        title={messages.addPriority}
      >
        <span className="truncate text-on-surface-variant font-medium">{messages.addPriority}</span>
        <ChevronDown size={14} className={`text-on-surface-variant/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-surface-container-high border border-outline-variant/40 rounded-md shadow-[0_18px_40px_rgba(90,82,74,0.2)] overflow-hidden flex flex-col max-h-64">
          <div className="overflow-y-auto overflow-x-hidden flex-1 log-scrollbar py-1">
            {availableOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange([...values, option.value]);
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 text-sm cursor-pointer hover:bg-primary/10 transition-colors truncate text-on-surface hover:text-primary-light"
              >
                {option.label}
              </div>
            ))}
            {availableOptions.length === 0 && (
              <div className="px-3 py-4 text-xs text-center text-on-surface-variant/50">
                {messages.allPrioritiesSelected}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

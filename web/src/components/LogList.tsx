import { memo, useEffect, useRef, useState } from 'react';

import { useI18n } from '../i18n-context';
import { AnsiText } from './AnsiText';
import { LOG_ROW_HEIGHT, VIRTUAL_OVERSCAN } from '../constants/app';
import type { HighlightMatcher, LogEntry } from '../types/app';
import { buildHighlightMatcher, formatTimestamp, getPriorityClasses } from '../utils/app';

const LogRow = memo(function LogRow({
  log,
  isActive,
  onOpenLog,
  highlightMatcher
}: {
  log: LogEntry;
  isActive: boolean;
  onOpenLog: (log: LogEntry) => void;
  highlightMatcher?: HighlightMatcher | null;
}) {
  const { locale, messages } = useI18n();
  const prio = getPriorityClasses(log.PRIORITY);
  const unit = log.SYSLOG_IDENTIFIER || log._COMM || log._SYSTEMD_UNIT || messages.unknownSource;
  const message = typeof log.MESSAGE === 'string' ? log.MESSAGE : String(log.MESSAGE);
  const shouldHighlight = !!highlightMatcher && !!log._s?.includes(highlightMatcher.query);

  return (
    <div
      onClick={() => onOpenLog(log)}
      className={`grid grid-cols-[130px_80px_minmax(0,1fr)] md:grid-cols-[160px_120px_minmax(0,1fr)] min-w-max items-center pl-3 pr-3 md:px-8 py-1 hover:bg-surface-container-low border-l-4 group cursor-pointer transition-colors ${prio.border} ${isActive ? 'bg-surface-container' : ''}`}
    >
      <span className="w-[130px] md:w-[160px] shrink-0 text-on-surface-variant/80 align-middle leading-[24px]">{formatTimestamp(log.__REALTIME_TIMESTAMP, locale)}</span>
      <span className={`w-[80px] md:w-[120px] shrink-0 font-medium pr-2 truncate align-middle leading-[24px] ${prio.text}`}>{unit}</span>
      <span className="text-on-surface whitespace-pre align-middle leading-[24px]">
        <AnsiText text={message} highlightMatcher={shouldHighlight ? highlightMatcher : null} />
      </span>
    </div>
  );
});

function isSameLog(a: LogEntry | null, b: LogEntry | null) {
  if (!a || !b) return false;
  return a.__REALTIME_TIMESTAMP === b.__REALTIME_TIMESTAMP && a.MESSAGE === b.MESSAGE;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function VirtualLogList({
  logs,
  logIndices,
  activeLog,
  onActivateLog,
  onOpenLog,
  status,
  searchQuery,
  errorMessage
}: {
  logs: LogEntry[];
  logIndices?: number[] | null;
  activeLog: LogEntry | null;
  onActivateLog: (log: LogEntry | null) => void;
  onOpenLog: (log: LogEntry) => void;
  status: string;
  searchQuery?: string;
  errorMessage?: string | null;
}) {
  const { messages } = useI18n();
  const highlightMatcher = buildHighlightMatcher(searchQuery);
  const totalCount = logIndices?.length ?? logs.length;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const updateViewportHeight = () => {
      setViewportHeight(node.clientHeight);
    };

    updateViewportHeight();
    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visibleCount = Math.max(1, Math.ceil((viewportHeight || LOG_ROW_HEIGHT) / LOG_ROW_HEIGHT));
  const startIndex = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
  const endIndex = Math.min(totalCount, startIndex + visibleCount + VIRTUAL_OVERSCAN * 2);
  const paddingTop = startIndex * LOG_ROW_HEIGHT;
  const paddingBottom = Math.max(0, (totalCount - endIndex) * LOG_ROW_HEIGHT);
  const visibleItems: Array<{ log: LogEntry; key: string | number; isActive: boolean }> = [];
  const activeVirtualIndex = activeLog
    ? (logIndices
        ? logIndices.findIndex((actualIndex) => isSameLog(logs[actualIndex] ?? null, activeLog))
        : logs.findIndex((log) => isSameLog(log, activeLog)))
    : -1;

  for (let virtualIndex = startIndex; virtualIndex < endIndex; virtualIndex++) {
    const actualIndex = logIndices ? logIndices[virtualIndex] : virtualIndex;
    const log = logs[actualIndex];
    if (!log) continue;
    visibleItems.push({
      log,
      key: log.__CURSOR || actualIndex,
      isActive: isSameLog(activeLog, log)
    });
  }

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node || activeVirtualIndex < 0) return;

    const itemTop = activeVirtualIndex * LOG_ROW_HEIGHT;
    const itemBottom = itemTop + LOG_ROW_HEIGHT;
    const viewportTop = node.scrollTop;
    const viewportBottom = viewportTop + node.clientHeight;

    if (itemTop < viewportTop) {
      node.scrollTop = itemTop;
    } else if (itemBottom > viewportBottom) {
      node.scrollTop = Math.max(0, itemBottom - node.clientHeight);
    }
  }, [activeVirtualIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (totalCount === 0 || isEditableTarget(event.target)) return;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const node = scrollContainerRef.current;
        if (!node) return;
        event.preventDefault();
        const horizontalStep = Math.max(120, Math.floor(node.clientWidth * 0.2));
        node.scrollLeft += event.key === 'ArrowRight' ? horizontalStep : -horizontalStep;
        return;
      }

      if (event.key === 'Enter') {
        if (activeVirtualIndex < 0) return;
        event.preventDefault();
        const actualIndex = logIndices ? logIndices[activeVirtualIndex] : activeVirtualIndex;
        const nextLog = logs[actualIndex] ?? null;
        if (nextLog) {
          onOpenLog(nextLog);
        }
        return;
      }

      let nextIndex = activeVirtualIndex;
      switch (event.key) {
        case 'ArrowDown':
          nextIndex = activeVirtualIndex >= 0 ? Math.min(totalCount - 1, activeVirtualIndex + 1) : 0;
          break;
        case 'ArrowUp':
          nextIndex = activeVirtualIndex >= 0 ? Math.max(0, activeVirtualIndex - 1) : totalCount - 1;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = totalCount - 1;
          break;
        case 'PageDown':
          nextIndex = activeVirtualIndex >= 0 ? Math.min(totalCount - 1, activeVirtualIndex + visibleCount) : Math.min(totalCount - 1, visibleCount - 1);
          break;
        case 'PageUp':
          nextIndex = activeVirtualIndex >= 0 ? Math.max(0, activeVirtualIndex - visibleCount) : 0;
          break;
        default:
          return;
      }

      event.preventDefault();
      const actualIndex = logIndices ? logIndices[nextIndex] : nextIndex;
      onActivateLog(logs[actualIndex] ?? null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeVirtualIndex, logIndices, logs, onActivateLog, onOpenLog, totalCount, visibleCount]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="h-full w-full overflow-auto log-scrollbar text-sm selection:bg-primary/30"
    >
      {status !== 'connected' && logs.length === 0 ? (
        <div className="p-8 text-outline text-center text-sm">
          {status === 'connecting' ? messages.runningQuery : errorMessage ? messages.queryFailed(errorMessage) : messages.waitingForQuery}
        </div>
      ) : (
        <div className="min-w-max" style={{ paddingTop, paddingBottom }}>
          {visibleItems.map(({ log, key, isActive }) => (
            <LogRow
              key={key}
              log={log}
              isActive={isActive}
              onOpenLog={onOpenLog}
              highlightMatcher={highlightMatcher}
            />
          ))}
        </div>
      )}
    </div>
  );
}

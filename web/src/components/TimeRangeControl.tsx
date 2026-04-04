import { useEffect, useRef, useState } from 'react';
import { Calendar, Clock3 } from 'lucide-react';

import { useI18n } from '../i18n-context';
import { getNowEndTimeInput } from '../utils/app';
import { Popover } from './Popover';
import { getPopoverPosition, type PopoverPosition } from './popover-position';

type TimeRangeControlProps = {
  endTimeInput: string;
  isLiveTailing: boolean;
  isPinnedToNow: boolean;
  liveTailAvailable: boolean;
  /** 'sm' = mobile (h-8, px-2 gaps), 'md' = desktop (h-9, px-3 gaps) */
  size: 'sm' | 'md';
  timeTitle: string;
  onSetNow: () => void;
  onSetEndTimeInput: (value: string) => void;
  onToggleLiveTail: () => void;
};

export function TimeRangeControl({
  endTimeInput,
  isLiveTailing,
  isPinnedToNow,
  liveTailAvailable,
  size,
  timeTitle,
  onSetNow,
  onSetEndTimeInput,
  onToggleLiveTail
}: TimeRangeControlProps) {
  const { messages } = useI18n();
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  // Position is computed in the clock button's onClick (event handler), never during render.
  const [timePickerPosition, setTimePickerPosition] = useState<PopoverPosition | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // useRef instead of useState so we can mutate it in an effect without
  // triggering extra renders (avoids react-hooks/set-state-in-effect lint error).
  const pendingDateOpen = useRef(false);

  const [endDate = '', endTime = '00:00'] = endTimeInput.split('T');

  const sm = size === 'sm';
  const px = sm ? 'px-2' : 'px-3';
  const h = sm ? 'h-8' : 'h-9';
  const toggleSize = sm ? 'h-4 w-7' : 'h-4 w-7 md:h-5 md:w-9';
  const knobSize = sm ? 'h-3 w-3' : 'h-3 w-3 md:h-4 md:w-4';
  const knobTranslate = sm
    ? (isLiveTailing ? 'translate-x-[14px]' : 'translate-x-0.5')
    : (isLiveTailing ? 'translate-x-[14px] md:translate-x-5' : 'translate-x-0.5');
  const liveGap = sm ? 'gap-1.5' : 'gap-2';

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  // When the user clicks "Set Time" (while isPinnedToNow is true):
  //  1. Freeze the time at now → parent sets isPinnedToNow=false next render
  //  2. Mark the pending flag so the effect below opens the date picker once
  //     isPinnedToNow has actually flipped to false.
  const beginCustomTimeSelection = () => {
    onSetEndTimeInput(getNowEndTimeInput());
    pendingDateOpen.current = true;
  };

  // Watch for isPinnedToNow flipping to false while pendingDateOpen is set.
  // We only call openDatePicker() (DOM side-effect) — no setState — so the
  // react-hooks/set-state-in-effect rule is satisfied.
  useEffect(() => {
    if (!pendingDateOpen.current || isPinnedToNow) return;
    pendingDateOpen.current = false;
    openDatePicker();
  }, [isPinnedToNow]);

  const handleClockClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isTimePickerOpen) {
      // Compute position from the button's rect in the event handler — valid per react-hooks/refs.
      setTimePickerPosition(getPopoverPosition(e.currentTarget, 'right'));
    }
    setIsTimePickerOpen((prev) => !prev);
  };

  const dateLabel = isPinnedToNow
    ? messages.setTime
    : (endDate.split('-').join(' / ') || endDate);

  return (
    <div
      className={`relative flex ${h} shrink-0 items-stretch overflow-visible rounded-md border transition-colors ${isLiveTailing ? 'border-primary/35 bg-surface-container' : 'border-outline-variant/45 bg-surface-container'}`}
      title={timeTitle}
    >
      {/* NOW button */}
      <button
        type="button"
        onClick={onSetNow}
        className={`ui-action-caption shrink-0 border-r ${px} rounded-l-md ${isPinnedToNow ? 'border-primary/25 bg-primary text-on-primary' : 'border-outline-variant/25 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`}
        title={messages.setEndTimeToNow}
      >
        {messages.now}
      </button>

      {/* Date + Time area */}
      <div className="min-w-0 flex flex-1 items-center bg-surface-container-lowest text-xs font-medium text-on-surface-variant">
        {/* Date button */}
        <button
          type="button"
          onClick={isPinnedToNow ? beginCustomTimeSelection : openDatePicker}
          className={`relative flex h-full shrink-0 items-center gap-1 ${px} text-left transition-colors hover:bg-surface-container-low hover:text-on-surface`}
          title={isPinnedToNow ? messages.setEndTime : messages.chooseEndDate}
        >
          <Calendar size={14} className="shrink-0 text-on-surface-variant/70" />
          <span className="truncate text-sm font-medium text-on-surface-variant">
            {dateLabel}
          </span>
          {/* Hidden native date input — triggered imperatively */}
          <input
            ref={dateInputRef}
            type="date"
            value={endDate}
            onChange={(e) => onSetEndTimeInput(`${e.target.value}T${endTime}`)}
            tabIndex={-1}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            aria-label={messages.endDate}
          />
        </button>

        {/* Clock / time picker (only when not pinned to now) */}
        {!isPinnedToNow && (
          <button
            type="button"
            onClick={handleClockClick}
            className={`flex h-full cursor-pointer items-center gap-1 ${px} transition-colors hover:bg-surface-container-low ${isTimePickerOpen ? 'bg-surface-container-low text-primary' : 'text-on-surface-variant'}`}
            title={messages.chooseEndTime}
            aria-expanded={isTimePickerOpen}
            aria-haspopup="dialog"
          >
            <Clock3
              size={14}
              className={`shrink-0 transition-colors ${isTimePickerOpen ? 'text-primary' : 'text-on-surface-variant/60'}`}
            />
            <span className="text-sm font-medium">{endTime}</span>
          </button>
        )}
      </div>

      {/* Divider */}
      <div className={`w-px ${isLiveTailing ? 'bg-primary/20' : 'bg-outline-variant/25'}`} />

      {/* LIVE button */}
      <button
        type="button"
        onClick={onToggleLiveTail}
        title={liveTailAvailable ? messages.toggleLiveTail : messages.liveTailOnlyWhenNow}
        disabled={!liveTailAvailable}
        className={`ui-action-caption flex shrink-0 items-center ${liveGap} bg-surface-container-lowest ${px} rounded-r-md ${liveTailAvailable ? 'cursor-pointer hover:bg-surface-container-low' : 'cursor-not-allowed opacity-50'} ${isLiveTailing ? 'text-primary' : 'text-on-surface-variant'}`}
      >
        <span>{messages.live}</span>
        <span className={`relative inline-flex ${toggleSize} items-center rounded-full transition-colors ${isLiveTailing ? 'bg-primary' : 'bg-outline-variant'}`}>
          <span className={`inline-block ${knobSize} transform rounded-full bg-white transition-transform ${knobTranslate}`} />
        </span>
      </button>

      {/* Time picker popover — rendered via portal to avoid overflow clipping */}
      <Popover
        position={timePickerPosition}
        isOpen={isTimePickerOpen}
        onClose={() => setIsTimePickerOpen(false)}
        className="flex flex-col gap-2 rounded-lg border border-outline-variant/35 bg-surface-container-low/95 p-3 shadow-[0_16px_40px_rgba(60,80,140,0.14)] backdrop-blur"
      >
        <span className="ui-action-caption text-[10px] text-on-surface-variant/60">
          {messages.endTime}
        </span>
        <input
          type="time"
          step={60}
          value={endTime}
          autoFocus
          onChange={(e) => onSetEndTimeInput(`${endDate}T${e.target.value}`)}
          onKeyDown={(e) => { if (e.key === 'Enter') setIsTimePickerOpen(false); }}
          className="h-9 w-[120px] rounded-md border border-primary/35 bg-surface-container-highest px-3 text-sm font-medium text-on-surface [color-scheme:light] focus:outline-none focus:border-primary"
          aria-label={messages.endTime}
        />
      </Popover>
    </div>
  );
}

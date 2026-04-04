export type PopoverPosition = {
  top: number;
  /** Distance from the RIGHT edge of the viewport (use when align='right') */
  right?: number;
  /** Distance from the LEFT edge of the viewport (use when align='left') */
  left?: number;
};

/**
 * Helper to compute a PopoverPosition from a trigger element's bounding rect.
 * Call this inside an event handler (onClick, etc.) and never during render.
 */
export function getPopoverPosition(
  el: HTMLElement,
  align: 'left' | 'right' = 'right',
  gap = 6
): PopoverPosition {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.bottom + gap,
    ...(align === 'right'
      ? { right: window.innerWidth - rect.right }
      : { left: rect.left })
  };
}

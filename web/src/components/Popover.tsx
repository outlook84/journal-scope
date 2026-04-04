import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PopoverPosition } from './popover-position';

type PopoverProps = {
  /**
   * Pre-computed fixed position for the popover. Compute this in an event
   * handler (e.g. the button's onClick) using getBoundingClientRect() — NOT
   * during render — to stay compliant with the react-hooks/refs lint rule.
   */
  position: PopoverPosition | null;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * A portal-based popover that renders into document.body to avoid overflow
 * clipping from ancestor containers. Positions itself as `fixed` using a
 * pre-computed `position` prop (derived from getBoundingClientRect in an
 * event handler, not during render).
 */
export function Popover({
  position,
  isOpen,
  onClose,
  children,
  className = ''
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: position.top,
    zIndex: 9999,
    ...(position.right !== undefined ? { right: position.right } : { left: position.left ?? 0 })
  };

  return createPortal(
    <div ref={popoverRef} style={style} className={className}>
      {children}
    </div>,
    document.body
  );
}

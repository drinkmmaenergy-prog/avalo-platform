'use client';

/**
 * OnboardingTooltip — FIX 133: First-time user guidance tooltips
 *
 * Shows a tooltip on first visit to key UI elements.
 * Dismissal state is persisted to localStorage so each tooltip
 * only appears once per user.
 *
 * Usage:
 *   <OnboardingTooltip id="discover_like" text="Tap ❤️ to like. If they like you back — it's a match!">
 *     <button onClick={handleLike}>❤️</button>
 *   </OnboardingTooltip>
 *
 * INVARIANTS:
 *   - Tooltip IDs are globally unique strings.
 *   - Dismissal is permanent (stored in localStorage).
 *   - Component is purely additive; no side effects on children behavior.
 */

import { useState, useEffect, type ReactNode } from 'react';

interface OnboardingTooltipProps {
  /** Unique key for dismissal tracking */
  id: string;
  /** Tooltip text to display */
  text: string;
  /** Position relative to children */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Child element that the tooltip points to */
  children: ReactNode;
}

export default function OnboardingTooltip({
  id,
  text,
  position = 'bottom',
  children,
}: OnboardingTooltipProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(`tooltip_${id}`);
      if (!dismissed) setShow(true);
    } catch {
      // localStorage unavailable — skip tooltip
    }
  }, [id]);

  const dismiss = () => {
    try {
      localStorage.setItem(`tooltip_${id}`, 'true');
    } catch {
      // localStorage unavailable — dismiss in memory only
    }
    setShow(false);
  };

  const positionClasses =
    position === 'bottom'
      ? 'top-full mt-2 left-1/2 -translate-x-1/2'
      : position === 'top'
        ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
        : position === 'right'
          ? 'left-full ml-2 top-1/2 -translate-y-1/2'
          : 'right-full mr-2 top-1/2 -translate-y-1/2';

  const arrowClasses =
    position === 'bottom'
      ? '-top-1 left-1/2 -translate-x-1/2'
      : position === 'top'
        ? '-bottom-1 left-1/2 -translate-x-1/2'
        : position === 'right'
          ? '-left-1 top-1/2 -translate-y-1/2'
          : '-right-1 top-1/2 -translate-y-1/2';

  return (
    <div className="relative">
      {children}
      {show && (
        <div className={`absolute z-40 ${positionClasses}`}>
          <div className="bg-[#E4458F] text-white text-xs px-3 py-2 rounded-lg shadow-lg max-w-[200px] relative">
            <span>{text}</span>
            <button
              onClick={dismiss}
              className="ml-2 text-white/70 hover:text-white"
              aria-label="Dismiss tooltip"
            >
              ✕
            </button>
            <div
              className={`absolute w-2 h-2 bg-[#E4458F] rotate-45 ${arrowClasses}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PACK 328B — Chat Timeout Indicator (Web)
 * 
 * Web component to display chat activity status and timeout warnings.
 * Shows last activity time and auto-expiration countdown.
 */

import React, { useState, useEffect } from 'react';

interface ChatTimeoutIndicatorProps {
  chatId: string;
  lastMessageAt?: string;
  isPaid: boolean;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED' | 'CANCELLED';
  onEndChat?: () => void;
}

export function ChatTimeoutIndicator({
  chatId,
  lastMessageAt,
  isPaid,
  status,
  onEndChat,
}: ChatTimeoutIndicatorProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!lastMessageAt || status !== 'ACTIVE') {
      return;
    }

    const updateTimer = () => {
      const lastActivity = new Date(lastMessageAt);
      const now = new Date();
      const hoursElapsed = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      
      const timeoutHours = isPaid ? 72 : 48;
      const hoursLeft = Math.max(0, timeoutHours - hoursElapsed);
      
      // Show warning if less than 12 hours remaining
      setShowWarning(hoursLeft < 12);
      
      if (hoursLeft === 0) {
        setTimeRemaining('Expired');
      } else if (hoursLeft < 1) {
        const minutesLeft = Math.floor(hoursLeft * 60);
        setTimeRemaining(`${minutesLeft}m left`);
      } else {
        setTimeRemaining(`${Math.floor(hoursLeft)}h left`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastMessageAt, isPaid, status]);

  if (status !== 'ACTIVE') {
    return null;
  }

  const formatLastActivity = () => {
    if (!lastMessageAt) return 'Just now';
    
    const lastActivity = new Date(lastMessageAt);
    const now = new Date();
    const diff = now.getTime() - lastActivity.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 my-2 border border-gray-200">
      <div className="flex items-center mb-2">
        <svg
          className={`w-4 h-4 mr-2 ${showWarning ? 'text-amber-500' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className={`text-sm ${showWarning ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
          Last message {formatLastActivity()}
        </span>
      </div>
      
      {showWarning && (
        <div className="flex items-center bg-amber-50 p-2 rounded-md mb-2">
          <svg
            className="w-4 h-4 mr-2 text-amber-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm text-amber-900 font-semibold">
            Chat expires in {timeRemaining}
          </span>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mb-3">
        This chat will auto-end after {isPaid ? '72h' : '48h'} of inactivity. 
        Unused tokens will be refunded.
      </p>
      
      {isPaid && onEndChat && (
        <button
          onClick={onEndChat}
          className="flex items-center justify-center w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 px-4 rounded-md transition-colors"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          End Chat & Refund
        </button>
      )}
    </div>
  );
}
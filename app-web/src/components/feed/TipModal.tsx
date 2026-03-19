'use client';

/**
 * Tip Modal Component
 * Shows preset token amounts [10, 25, 50, 100, custom] for tipping a post author.
 * On confirm, calls sendFeedTip from feedInteractionService.
 * Shows success toast after tipping.
 */

import React, { useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { sendFeedTip } from '@/lib/services/feedInteractionService';

const PRESET_AMOUNTS = [10, 25, 50, 100] as const;

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  senderId: string;
  recipientId: string;
  recipientName: string;
  postId: string;
}

export default function TipModal({
  isOpen,
  onClose,
  senderId,
  recipientId,
  recipientName,
  postId,
}: TipModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const effectiveAmount = isCustom
    ? parseInt(customAmount, 10) || 0
    : selectedAmount || 0;

  const handlePresetSelect = useCallback((amount: number) => {
    setSelectedAmount(amount);
    setIsCustom(false);
    setCustomAmount('');
    setError(null);
  }, []);

  const handleCustomSelect = useCallback(() => {
    setIsCustom(true);
    setSelectedAmount(null);
    setError(null);
  }, []);

  const handleSend = useCallback(async () => {
    if (effectiveAmount <= 0) {
      setError('Please select or enter a tip amount');
      return;
    }

    if (effectiveAmount > 10000) {
      setError('Maximum tip amount is 10,000 tokens');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const result = await sendFeedTip({
        senderId,
        recipientId,
        postId,
        amount: effectiveAmount,
      });

      if (result.success) {
        setSuccess(true);
        // Auto-close after showing success
        setTimeout(() => {
          setSuccess(false);
          setSelectedAmount(null);
          setCustomAmount('');
          setIsCustom(false);
          onClose();
        }, 2000);
      } else {
        setError(result.error || 'Failed to send tip');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send tip');
    } finally {
      setSending(false);
    }
  }, [effectiveAmount, senderId, recipientId, postId, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !sending) {
        onClose();
      }
    },
    [onClose, sending]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            💎 Send Tip
          </h3>
          <button
            onClick={onClose}
            disabled={sending}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success State */}
        {success ? (
          <div className="px-5 py-10 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              Tip sent!
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {recipientName} will be notified
            </p>
          </div>
        ) : (
          <>
            {/* Recipient Info */}
            <div className="px-5 pt-4 pb-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Send tokens to{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {recipientName}
                </span>
              </p>
            </div>

            {/* Preset Amounts */}
            <div className="px-5 py-3">
              <div className="grid grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => handlePresetSelect(amount)}
                    disabled={sending}
                    className={`
                      py-3 rounded-xl text-sm font-bold transition-all duration-200
                      ${
                        !isCustom && selectedAmount === amount
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {amount}
                  </button>
                ))}
              </div>

              {/* Custom Amount */}
              <button
                onClick={handleCustomSelect}
                disabled={sending}
                className={`
                  w-full mt-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                  ${
                    isCustom
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                Custom Amount
              </button>

              {isCustom && (
                <div className="mt-3">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    placeholder="Enter token amount..."
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setError(null);
                    }}
                    disabled={sending}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-center text-lg font-bold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent disabled:opacity-50"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-5 pb-2">
                <p className="text-xs text-red-500 dark:text-red-400">
                  {error}
                </p>
              </div>
            )}

            {/* Send Button */}
            <div className="px-5 pb-5 pt-2">
              <button
                onClick={handleSend}
                disabled={sending || effectiveAmount <= 0}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold text-sm hover:from-purple-700 hover:to-pink-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    💎 Send {effectiveAmount > 0 ? `${effectiveAmount} tokens` : 'Tip'}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { ActionButton } from './ActionButton';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'destructive';
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#1A1A1A] rounded-2xl border border-[#40E0D0]/30 p-8 max-w-md w-full mx-4 shadow-2xl backdrop-blur-xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          disabled={loading}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Warning Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#D4AF37]/10 mb-6 mx-auto">
          <AlertTriangle className={`w-8 h-8 ${variant === 'destructive' ? 'text-[#C53A3A]' : 'text-[#D4AF37]'}`} />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white text-center mb-4">
          {title}
        </h2>

        {/* Description */}
        <p className="text-gray-400 text-center mb-8 leading-relaxed">
          {description}
        </p>

        {/* Actions */}
        <div className="flex gap-4">
          <ActionButton
            onClick={onClose}
            variant="secondary"
            disabled={loading}
            className="flex-1"
          >
            {cancelLabel}
          </ActionButton>
          <ActionButton
            onClick={onConfirm}
            variant={variant}
            loading={loading}
            className="flex-1"
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'destructive' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function ActionButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
  icon: Icon,
}: ActionButtonProps) {
  const baseStyles = 'px-6 py-3 rounded-lg font-semibold text-base transition-all duration-200 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantStyles = {
    primary: 'bg-[#D4AF37] text-[#0F0F0F] hover:bg-[#F5D677] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)]',
    destructive: 'bg-[#C53A3A] text-white hover:bg-[#E05555] hover:shadow-[0_0_20px_rgba(197,58,58,0.5)]',
    secondary: 'bg-[#1A1A1A] text-white border-2 border-[#40E0D0] hover:bg-[#40E0D0]/10 hover:shadow-[0_0_20px_rgba(64,224,208,0.3)]',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Processing...</span>
        </>
      ) : (
        <>
          {Icon && <Icon className="w-5 h-5" />}
          {children}
        </>
      )}
    </button>
  );
}
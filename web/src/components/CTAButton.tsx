'use client';

import React from 'react';
import Link from 'next/link';

/**
 * CTA Button Component
 * Gradient button with glowing border (24px rounded) and pulse animation
 * Reference: #FF6B00 → #FF3C8E → #7B2EFF gradient
 */

interface CTAButtonProps {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  className?: string;
}

export const CTAButton: React.FC<CTAButtonProps> = ({
  href,
  onClick,
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  className = '',
}) => {
  const gradientClass = variant === 'primary' ? 'gradient-primary' : 'gradient-secondary';
  
  const sizeClasses = {
    small: 'px-4 py-2 text-sm',
    medium: 'px-6 py-3 text-base',
    large: 'px-8 py-4 text-lg',
  };

  // Rounded 24px with glowing gradient border
  const baseClasses = `
    relative
    ${sizeClasses[size]}
    font-semibold
    text-white
    transition-all
    duration-200
    hover:scale-105
    active:scale-95
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  const content = (
    <div className="relative group">
      {/* Glowing gradient border */}
      <div className={`absolute inset-0 ${gradientClass} rounded-[24px] p-[2px]`}>
        <div className={`h-full w-full ${gradientClass} rounded-[22px] flex items-center justify-center`}>
          <span className="text-white drop-shadow-md">{children}</span>
        </div>
      </div>
      {/* Inner shadow effect */}
      <div className={`${gradientClass} rounded-[24px] shadow-[0_4px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.4)]`}>
        <div className={`px-6 py-3 rounded-[22px] flex items-center justify-center`}>
          <span className="text-white font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{children}</span>
        </div>
      </div>
    </div>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
    >
      {content}
    </button>
  );
};
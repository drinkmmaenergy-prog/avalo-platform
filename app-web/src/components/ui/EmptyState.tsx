'use client';

import Link from 'next/link';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-4">{description}</p>
      {actionLabel &&
        (actionHref ? (
          <Link
            href={actionHref}
            className="px-6 py-2 bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] text-white rounded-full text-sm font-medium"
          >
            {actionLabel}
          </Link>
        ) : onAction ? (
          <button
            onClick={onAction}
            className="px-6 py-2 bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] text-white rounded-full text-sm font-medium"
          >
            {actionLabel}
          </button>
        ) : null)}
    </div>
  );
}

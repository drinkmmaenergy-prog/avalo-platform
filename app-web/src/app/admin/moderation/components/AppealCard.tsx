'use client';

import React from 'react';
import Link from 'next/link';
import { Flag, ChevronRight, Clock, User, FileText } from 'lucide-react';
import { Badge } from './Badge';

interface AppealCardProps {
  appeal: {
    id: string;
    appealText: string;
    language?: string;
    timestamp: string;
    status: string;
    userId?: string;
    username?: string;
    incidentId?: string;
  };
  onClick?: () => void;
}

export function AppealCard({ appeal, onClick }: AppealCardProps) {
  const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'success';
      case 'pending':
      case 'more_info_required':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'more_info_required':
        return 'text-orange-400';
      case 'rejected':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const content = (
    <div className="bg-[#1A1A1A] rounded-lg border border-[#40E0D0]/20 p-5 hover:border-[#40E0D0]/50 hover:bg-[#1A1A1A]/80 transition-all duration-200 cursor-pointer group">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-[#0F0F0F] flex items-center justify-center border-2 ${
          appeal.status.toLowerCase() === 'approved' 
            ? 'border-green-500' 
            : appeal.status.toLowerCase() === 'rejected'
            ? 'border-red-500' 
            : 'border-yellow-500'
        }`}>
          <Flag className={`w-6 h-6 ${getStatusColor(appeal.status)}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h3 className="text-lg font-semibold text-white group-hover:text-[#40E0D0] transition-colors mb-1">
                Appeal #{appeal.id.substring(0, 8)}
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant={getStatusVariant(appeal.status)}>
                  {appeal.status.replace(/_/g, ' ').toUpperCase()}
                </Badge>
                {appeal.language && (
                  <Badge variant="neutral">{appeal.language.toUpperCase()}</Badge>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#40E0D0] transition-colors flex-shrink-0" />
          </div>

          {/* Appeal Text Preview */}
          <p className="text-sm text-gray-400 mb-3 line-clamp-2">
            {appeal.appealText}
          </p>

          {/* Meta Info */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {appeal.username && (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <span>{appeal.username}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{new Date(appeal.timestamp).toLocaleString()}</span>
            </div>
            {appeal.incidentId && (
              <div className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <span>Incident: {appeal.incidentId.substring(0, 8)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (onClick) {
    return <div onClick={onClick}>{content}</div>;
  }

  return (
    <Link href={`/admin/moderation/appeals/${appeal.id}`}>
      {content}
    </Link>
  );
}
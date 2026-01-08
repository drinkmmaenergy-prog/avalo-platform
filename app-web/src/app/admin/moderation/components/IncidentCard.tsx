'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Clock, User } from 'lucide-react';
import { Badge } from './Badge';

interface IncidentCardProps {
  incident: {
    id: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    snippet?: string;
    timestamp: string;
    userId?: string;
    username?: string;
    status?: string;
  };
  onClick?: () => void;
}

export function IncidentCard({ incident, onClick }: IncidentCardProps) {
  const getSeverityVariant = (severity: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (severity.toLowerCase()) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
      case 'critical':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'low':
        return 'text-green-400';
      case 'medium':
        return 'text-yellow-400';
      case 'high':
        return 'text-orange-400';
      case 'critical':
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
          incident.severity === 'critical' || incident.severity === 'high' 
            ? 'border-red-500' 
            : incident.severity === 'medium' 
            ? 'border-yellow-500' 
            : 'border-green-500'
        }`}>
          <AlertTriangle className={`w-6 h-6 ${getSeverityColor(incident.severity)}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h3 className="text-lg font-semibold text-white group-hover:text-[#40E0D0] transition-colors">
                {incident.category}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={getSeverityVariant(incident.severity)}>
                  {incident.severity.toUpperCase()}
                </Badge>
                {incident.status && (
                  <Badge variant="neutral">{incident.status}</Badge>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#40E0D0] transition-colors flex-shrink-0" />
          </div>

          {/* Snippet */}
          {incident.snippet && (
            <p className="text-sm text-gray-400 mb-3 line-clamp-2">
              {incident.snippet}
            </p>
          )}

          {/* Meta Info */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {incident.username && (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <span>{incident.username}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{new Date(incident.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono">ID: {incident.id.substring(0, 8)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (onClick) {
    return <div onClick={onClick}>{content}</div>;
  }

  return (
    <Link href={`/admin/moderation/incidents/${incident.id}`}>
      {content}
    </Link>
  );
}
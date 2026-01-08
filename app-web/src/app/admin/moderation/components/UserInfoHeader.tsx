'use client';

import React from 'react';
import { User, Shield, TrendingUp, Calendar } from 'lucide-react';
import { Badge } from './Badge';

interface UserInfoHeaderProps {
  user: {
    uid: string;
    username?: string;
    email?: string;
    displayName?: string;
    avatar?: string;
    tier?: string;
    trustScore?: number;
    status?: string;
    joinedDate?: string;
  };
}

export function UserInfoHeader({ user }: UserInfoHeaderProps) {
  const getStatusVariant = (status?: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'restricted':
      case 'warning':
      case 'shadow_restricted':
        return 'warning';
      case 'suspended':
      case 'banned':
      case 'banned_permanent':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getTrustScoreColor = (score?: number): string => {
    if (!score) return 'text-gray-400';
    if (score >= 80) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6 shadow-lg">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.username || 'User'}
              className="w-24 h-24 rounded-full border-4 border-[#D4AF37] object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border-4 border-[#D4AF37] bg-[#0F0F0F] flex items-center justify-center">
              <User className="w-12 h-12 text-[#40E0D0]" />
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-2xl font-bold text-white">
              {user.displayName || user.username || 'Unknown User'}
            </h2>
            {user.status && (
              <Badge variant={getStatusVariant(user.status)}>
                {user.status.toUpperCase()}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {/* Email */}
            {user.email && (
              <div className="flex items-center gap-2">
                <div className="text-gray-400 text-sm">Email:</div>
                <div className="text-white text-sm font-medium">{user.email}</div>
              </div>
            )}

            {/* User ID */}
            <div className="flex items-center gap-2">
              <div className="text-gray-400 text-sm">User ID:</div>
              <div className="text-white text-sm font-mono">{user.uid.substring(0, 8)}...</div>
            </div>

            {/* Tier */}
            {user.tier && (
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#D4AF37]" />
                <div className="text-gray-400 text-sm">Tier:</div>
                <div className="text-[#D4AF37] text-sm font-semibold uppercase">{user.tier}</div>
              </div>
            )}

            {/* Trust Score */}
            {user.trustScore !== undefined && (
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-4 h-4 ${getTrustScoreColor(user.trustScore)}`} />
                <div className="text-gray-400 text-sm">Trust Score:</div>
                <div className={`text-sm font-bold ${getTrustScoreColor(user.trustScore)}`}>
                  {user.trustScore}/100
                </div>
              </div>
            )}

            {/* Joined Date */}
            {user.joinedDate && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#40E0D0]" />
                <div className="text-gray-400 text-sm">Joined:</div>
                <div className="text-white text-sm">
                  {new Date(user.joinedDate).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}